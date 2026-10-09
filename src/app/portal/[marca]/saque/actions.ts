"use server";

import { redirect } from "next/navigation";
import { brlToCents } from "@/lib/commission/adjust";
import { db } from "@/lib/db";
import { currentPortalContext } from "@/lib/portal/current";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { currentActor } from "@/lib/auth/current";
import { assertCanStart, assertRequestId, MAX_NF_BYTES, NF_BUCKET, nfPath, requestWithdrawal, WithdrawalRequestError } from "@/lib/withdrawals/request";

export type UploadTicket = { ok: true; signedUrl: string } | { ok: false; error: string };

/** Link de envio de uso único para a NF ir direto do navegador ao bucket privado (a Vercel limita o corpo a 4,5 MB). */
export async function prepareNfUpload(marca: string, requestId: string): Promise<UploadTicket> {
  try {
    assertRequestId(requestId);
    const ctx = await currentPortalContext(marca);
    await assertCanStart(db(), ctx);
    const { data, error } = await supabaseAdmin().storage.from(NF_BUCKET).createSignedUploadUrl(nfPath(ctx.brand.id, ctx.creatorId, requestId), { upsert: true });
    if (error || !data) throw new Error(error?.message ?? "sem link");
    return { ok: true, signedUrl: data.signedUrl };
  } catch (error) {
    if (error instanceof WithdrawalRequestError) return { ok: false, error: error.message };
    console.error("withdrawal.prepare", error);
    return { ok: false, error: "Não foi possível preparar o envio. Tente de novo em instantes." };
  }
}

export type SubmitState = { error?: string } | undefined;

export async function submitWithdrawal(_prev: SubmitState, form: FormData): Promise<SubmitState> {
  const marca = String(form.get("marca") ?? "");
  try {
    const ctx = await currentPortalContext(marca);
    const actor = await currentActor();
    if (!actor) return { error: "Sua sessão expirou. Entre de novo." };
    const requestId = String(form.get("requestId") ?? "");
    assertRequestId(requestId);
    let amountCents: number;
    try {
      amountCents = brlToCents(String(form.get("amount") ?? ""));
    } catch {
      return { error: "Valor inválido." };
    }
    const { data, error } = await supabaseAdmin().storage.from(NF_BUCKET).download(nfPath(ctx.brand.id, ctx.creatorId, requestId));
    if (error || !data) return { error: "A nota fiscal não chegou. Envie o PDF de novo." };
    if (data.size > MAX_NF_BYTES) return { error: "A nota fiscal passa de 10 MB." };
    const pdf = new Uint8Array(await data.arrayBuffer());
    const pixKey = String(form.get("pixKey") ?? "");
    await requestWithdrawal(db(), ctx, { actorUserId: actor.userId, requestId, amountCents, pdf, ...(pixKey ? { pixKey } : {}) });
  } catch (error) {
    if (error instanceof WithdrawalRequestError) return { error: error.message };
    throw error;
  }
  redirect(`/portal/${marca}/saque?pedido=enviado`);
}
