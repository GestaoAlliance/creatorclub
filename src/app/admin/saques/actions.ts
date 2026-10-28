"use server";

import { revalidatePath } from "next/cache";
import { currentActor } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { generateRemessa, RemessaError, removeFromRemessa } from "@/lib/withdrawals/remessa";
import { applyRetorno, retornoPreview, type RetornoRow } from "@/lib/withdrawals/retorno";
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

export type RemessaState = { error?: string; problems?: string[]; file?: { name: string; content: string }; ok?: string } | undefined;

/** D-REMESSA: gera o arquivo CNAB 240 (Pix) dos aprovados ainda não enviados; o navegador baixa. */
export async function remessaAction(_prev: RemessaState, form: FormData): Promise<RemessaState> {
  try {
    const r = await generateRemessa(db(), await currentActor(), String(form.get("brandId") ?? ""), String(form.get("payDay") ?? ""));
    revalidatePath("/admin/saques");
    return { file: { name: r.fileName, content: r.content }, ok: `Remessa nº ${r.nsa}: ${r.count} ${r.count === 1 ? "saque" : "saques"}. Envie o arquivo no Internet Banking do SICOOB.` };
  } catch (error) {
    if (error instanceof RemessaError) return { error: error.message, problems: error.problems.map((p) => p.problem) };
    throw error;
  }
}

export async function removeRemessaAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    await removeFromRemessa(db(), await currentActor(), String(form.get("withdrawalId") ?? ""));
    revalidatePath("/admin/saques");
    return { ok: "Saque fora da remessa: entra na próxima." };
  } catch (error) {
    if (error instanceof RemessaError) return { error: error.message };
    throw error;
  }
}

export type RetornoState =
  | { error?: string; problems?: string[]; ok?: string; preview?: { nsa: number; content: string; rows: RetornoRow[] } }
  | undefined;

/** D-RETORNO: primeiro a prévia (arquivo escolhido); depois "Confirmar" aplica o mesmo conteúdo. */
export async function retornoAction(_prev: RetornoState, form: FormData): Promise<RetornoState> {
  const brandId = String(form.get("brandId") ?? "");
  try {
    const actor = await currentActor();
    if (form.get("mode") === "apply") {
      const r = await applyRetorno(db(), actor, brandId, String(form.get("content") ?? ""));
      revalidatePath("/admin/saques");
      const parts = [
        r.paid && `${r.paid} ${r.paid === 1 ? "pago" : "pagos"}`,
        r.scheduled && `${r.scheduled} ${r.scheduled === 1 ? "agendado" : "agendados"}`,
        r.pending && `${r.pending} pendente${r.pending === 1 ? "" : "s"} de assinatura`,
        r.rejected && `${r.rejected} ${r.rejected === 1 ? "recusado (saiu da remessa)" : "recusados (saíram da remessa)"}`,
      ].filter(Boolean);
      return { ok: `Retorno da remessa nº ${r.nsa}: ${parts.length ? parts.join(", ") : "nada a mudar"}.` };
    }
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) return { error: "Escolha o arquivo de retorno baixado do Internet Banking." };
    const content = Buffer.from(await file.arrayBuffer()).toString("latin1");
    const p = await retornoPreview(db(), actor, brandId, content);
    return { preview: { nsa: p.nsa, content, rows: p.rows } };
  } catch (error) {
    if (error instanceof RemessaError) return { error: error.message, problems: error.problems.map((p) => p.problem) };
    throw error;
  }
}
