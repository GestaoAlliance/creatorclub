"use server";

import { currentActor } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { approveApplication, ApplicationError, createStaffApplication, rejectApplication, rejectApplications, type Category } from "@/lib/onboarding/applications";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { staffContext } from "@/lib/staff/context";
import { percentToBps, ReviewError } from "@/lib/coupons/review";
import { createCreatorInvite } from "@/lib/team/creator-invites";
import { TeamError } from "@/lib/team/invites";
import { headers } from "next/headers";
import { publicOrigin } from "@/lib/site";
import { configuredSender } from "@/lib/email/sender";
import { emailCreatorInvite } from "@/lib/team/invite-email";

export type ApproveState =
  | {
      error?: string;
      ok?: {
        coupon: string; discountBps: number; creatorId: string; link: string | null; inviteError?: string; mail?: string; mailError?: string;
        /** D-SIGNUPACCOUNT: ela criou a senha no cadastro; não há convite, ela entra com o e-mail. */
        loginUrl?: string;
        /** D-D4SIGN: aba Pedidos (passando pelo login) e produto sugerido da marca, para a mensagem de aprovação. */
        ordersUrl?: string;
        suggestion: string | null;
      };
    }
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
      ...(form.has("payout") ? { receivesAsIndividual: form.get("payout") === "cpf" } : {}),
    });
    // Sem revalidatePath aqui: a linha sumiria da aba "Novas" junto com o convite e o botão de WhatsApp. A tela
    // atualiza quando a equipe clica em "Concluir" (router.refresh).
    const origin = publicOrigin(await headers());
    const { brand } = await db().creator.findUniqueOrThrow({ where: { id: r.creatorId }, select: { brand: { select: { slug: true, approvalSuggestion: true } } } });
    const suggestion = brand.approvalSuggestion;
    // D-SIGNUPACCOUNT: quem se cadastrou pelo site já tem senha: sem convite, ela entra pelo login.
    const account = await db().creatorAccount.findUnique({ where: { id: r.accountId }, select: { userId: true } });
    if (account?.userId) {
      // M4.4a (D-BRANDLOGIN): o link de entrar abre com a cara da marca.
      return {
        ok: {
          coupon: r.couponCode, discountBps, creatorId: r.creatorId, link: null, suggestion,
          loginUrl: `${origin}/entrar?marca=${brand.slug}`, ordersUrl: `${origin}/entrar?next=/portal/${brand.slug}/envios`,
        },
      };
    }
    // O convite sai logo depois; se falhar (ex.: pessoa já tem login), a creator já está criada e o aviso aparece.
    let link: string | null = null;
    let inviteError: string | undefined;
    let mail: string | undefined;
    let mailError: string | undefined;
    try {
      const { token, invite } = await createCreatorInvite(db(), actor, r.accountId);
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
        coupon: r.couponCode, discountBps, creatorId: r.creatorId, link, suggestion,
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

/** M4.1 (D-MANUALAPP): recusar as marcadas de uma vez (mesmo motivo opcional para todas). */
export async function rejectManyAction(_prev: RejectState, form: FormData): Promise<RejectState> {
  try {
    const ids = form.getAll("applicationId").map(String).filter(Boolean);
    const r = await rejectApplications(db(), await currentActor(), ids, String(form.get("note") ?? ""));
    revalidatePath("/admin/candidatas");
    const many = r.rejected === 1 ? "1 candidata recusada" : `${r.rejected} candidatas recusadas`;
    return { ok: r.skipped > 0 ? `${many}; ${r.skipped} já tinham sido decididas.` : `${many}.` };
  } catch (error) {
    if (error instanceof ApplicationError) return { error: error.message };
    throw error;
  }
}

export type CreateState = { error?: string } | undefined;

/** M4.1 (D-MANUALAPP): "Nova candidata" pela equipe, na marca escolhida no topo; abre a lista de pendentes. */
export async function createApplicationAction(_prev: CreateState, form: FormData): Promise<CreateState> {
  const actor = await currentActor();
  if (!actor) return { error: "Sem permissão." };
  const brand = (await staffContext(actor)).brand;
  if (!brand) return { error: "Escolha a marca no topo." };
  const f = (k: string) => String(form.get(k) ?? "");
  try {
    await createStaffApplication(db(), actor, brand.id, {
      fullName: f("fullName"), phone: f("phone"), email: f("email"), instagram: f("instagram"), tiktok: f("tiktok"),
      followers: f("followers"), category: f("category") as Category, suggestedCoupon: f("suggestedCoupon"), note: f("note"), birthDate: f("birthDate"), address: f("address"),
    });
  } catch (error) {
    if (error instanceof ApplicationError) return { error: error.message };
    throw error;
  }
  revalidatePath("/admin/candidatas");
  redirect("/admin/candidatas?origem=staff_form");
}
