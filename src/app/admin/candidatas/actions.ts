"use server";

import { currentActor } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { approveApplication, ApplicationError, rejectApplication, type Category } from "@/lib/onboarding/applications";
import { percentToBps, ReviewError } from "@/lib/coupons/review";
import { createCreatorInvite } from "@/lib/team/creator-invites";
import { TeamError } from "@/lib/team/invites";
import { headers } from "next/headers";
import { configuredSender } from "@/lib/email/sender";
import { emailCreatorInvite } from "@/lib/team/invite-email";

export type ApproveState =
  | { error?: string; ok?: { coupon: string; discountBps: number; contract: boolean; creatorId: string; link: string | null; inviteError?: string; mail?: string; mailError?: string } }
  | undefined;

export async function approveAction(_prev: ApproveState, form: FormData): Promise<ApproveState> {
  const actor = await currentActor();
  try {
    const discountBps = percentToBps(String(form.get("discount") ?? ""));
    // F3: o cupom é criado na Shopify primeiro; se ela recusar, nada é gravado e a mensagem pede outro código.
    const r = await approveApplication(db(), actor, {
      applicationId: String(form.get("applicationId") ?? ""),
      couponCode: String(form.get("coupon") ?? ""),
      category: String(form.get("category") ?? "") as Category,
      rateBps: percentToBps(String(form.get("rate") ?? "")),
      discountBps,
      email: String(form.get("email") ?? ""),
      contractTemplateId: String(form.get("contractTemplateId") ?? "") || null,
    });
    // Sem revalidatePath aqui: a linha sumiria da aba "Novas" junto com o convite e o botão de WhatsApp. A tela
    // atualiza quando a equipe clica em "Concluir" (router.refresh).
    // O convite sai logo depois; se falhar (ex.: pessoa já tem login), a creator já está criada e o aviso aparece.
    let link: string | null = null;
    let inviteError: string | undefined;
    let mail: string | undefined;
    let mailError: string | undefined;
    try {
      const { token, invite } = await createCreatorInvite(db(), actor, r.accountId);
      const origin = (await headers()).get("origin") ?? "";
      link = `${origin}/convite/${token}`;
      // D-EMAIL: com remetente configurado, o convite também vai por e-mail; sem ele, só o link e o WhatsApp.
      const sent = await emailCreatorInvite(db(), configuredSender(), { inviteId: invite.id, actorId: actor!.userId, link });
      if (sent?.sent) mail = sent.to;
      else if (sent) mailError = sent.reason;
    } catch (error) {
      if (!(error instanceof TeamError)) throw error;
      inviteError = error.message;
    }
    return {
      ok: {
        coupon: r.couponCode, discountBps, contract: Boolean(form.get("contractTemplateId")), creatorId: r.creatorId, link,
        ...(inviteError ? { inviteError } : {}), ...(mail ? { mail } : {}), ...(mailError ? { mailError } : {}),
      },
    };
  } catch (error) {
    if (error instanceof ApplicationError || error instanceof ReviewError) return { error: error.message };
    throw error;
  }
}

export type RejectState = { error?: string; ok?: string } | undefined;

export async function rejectAction(_prev: RejectState, form: FormData): Promise<RejectState> {
  try {
    await rejectApplication(db(), await currentActor(), String(form.get("applicationId") ?? ""), String(form.get("note") ?? ""));
    // Como no aprovar: a tela atualiza no "Concluir", depois do WhatsApp de resposta.
    return { ok: "Candidata recusada." };
  } catch (error) {
    if (error instanceof ApplicationError) return { error: error.message };
    throw error;
  }
}
