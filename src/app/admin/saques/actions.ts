"use server";

import { revalidatePath } from "next/cache";
import { currentActor } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { approveWithdrawal, nfLocation, payWithdrawal, payWithdrawals, recheckWithdrawalNf, rejectWithdrawal, WithdrawalDecisionError } from "@/lib/withdrawals/decide";

export type ActionState = { error?: string; ok?: string } | undefined;

async function run(fn: () => Promise<string | void>, ok: string): Promise<ActionState> {
  try {
    const msg = await fn();
    revalidatePath("/admin/saques");
    return { ok: msg || ok };
  } catch (error) {
    if (error instanceof WithdrawalDecisionError) return { error: error.message };
    throw error;
  }
}

export async function approveAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return run(async () => approveWithdrawal(db(), await currentActor(), String(form.get("withdrawalId"))), "Aprovado: foi para a fila de pagamento.");
}

export async function payAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return run(async () => payWithdrawal(db(), await currentActor(), String(form.get("withdrawalId"))), "Marcado como pago.");
}

export async function rejectAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return run(async () => rejectWithdrawal(db(), await currentActor(), String(form.get("withdrawalId")), String(form.get("reason") ?? "")), "Saque recusado.");
}

/** Baixa a nota do Storage e confere de novo (M1.1). */
export async function recheckAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return run(async () => {
    const actor = await currentActor();
    const id = String(form.get("withdrawalId"));
    const file = await nfLocation(db(), actor, id);
    const { data, error } = await supabaseAdmin().storage.from(file.bucket).download(file.path);
    if (error || !data) throw new WithdrawalDecisionError("Não foi possível abrir a nota agora. Tente de novo em instantes.");
    const r = await recheckWithdrawalNf(db(), actor, id, new Uint8Array(await data.arrayBuffer()));
    if (r.nfCheck === "OK") return "Nota conferida: tomadora, valor, emissor e código batem.";
    throw new WithdrawalDecisionError(r.problems.length ? `Não bate: ${r.problems.join(" ")}` : "O sistema ainda não consegue ler esta nota. Confira abrindo o PDF.");
  }, "");
}

/** M1.5: marcar vários aprovados como pagos depois do Pix em lote. */
export async function payBatchAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return run(async () => {
    const ids = form.getAll("ids").map(String);
    const r = await payWithdrawals(db(), await currentActor(), ids);
    const ok = `${r.paid.length} ${r.paid.length === 1 ? "saque marcado" : "saques marcados"} como pago.`;
    if (r.failed.length) throw new WithdrawalDecisionError(`${ok} ${r.failed.length} não ${r.failed.length === 1 ? "foi" : "foram"}: ${r.failed[0]!.reason}`);
    return ok;
  }, "");
}
