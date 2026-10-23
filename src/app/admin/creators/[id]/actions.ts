"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { currentActor } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { percentToBps, ReviewError } from "@/lib/coupons/review";
import { changeRate, ProfileError, setCreatorStatus, updateContact, updateProfile, type CreatorStatusValue } from "@/lib/creators/profile";
import { createCreatorInvite } from "@/lib/team/creator-invites";
import { emailCreatorInvite } from "@/lib/team/invite-email";
import { configuredSender } from "@/lib/email/sender";
import { AdjustError, brlToCents, createAdjustment } from "@/lib/commission/adjust";
import { TeamError } from "@/lib/team/invites";
import { markReviewed, OpeningError } from "@/lib/withdrawals/opening";
import { correctRateSinceStart, RateFixError } from "@/lib/commission/rate-fix";
import { ContractError, updateChecklist } from "@/lib/creators/contract";
import { CouponCreateError, createCouponInShopify } from "@/lib/coupons/create";
import { changeCouponDiscount, DiscountChangeError } from "@/lib/coupons/discount";
import { addUgcVideo, removeUgcVideo, setUgcVideoGoal, UgcError } from "@/lib/creators/ugc";
import { formatBRL } from "@/domain";
import { checkCreatorContracts, ContractSendError, sendContract } from "@/lib/autentique/contracts";
import { addCreatorNote, NoteError } from "@/lib/creators/timeline";
import { addCreatorTag, removeCreatorTag, TagError } from "@/lib/creators/tags";

export type State = { error?: string; ok?: string; link?: string } | undefined;

async function run(id: string, fn: () => Promise<State | void>, ok: string): Promise<State> {
  try {
    const r = await fn();
    revalidatePath(`/admin/creators/${id}`);
    return r ?? { ok };
  } catch (error) {
    if (error instanceof ProfileError || error instanceof ReviewError || error instanceof TeamError || error instanceof AdjustError || error instanceof OpeningError || error instanceof RateFixError || error instanceof ContractError || error instanceof CouponCreateError || error instanceof UgcError || error instanceof ContractSendError || error instanceof NoteError || error instanceof DiscountChangeError || error instanceof TagError) {
      return { error: error.message };
    }
    throw error;
  }
}

export async function contactAction(_p: State, form: FormData): Promise<State> {
  const id = String(form.get("creatorId"));
  return run(id, async () => updateContact(db(), await currentActor(), id, {
    name: String(form.get("name") ?? ""),
    email: String(form.get("email") ?? ""),
    phone: String(form.get("phone") ?? ""),
    instagram: String(form.get("instagram") ?? ""),
    tiktok: String(form.get("tiktok") ?? ""),
    birthDate: String(form.get("birthDate") ?? ""),
  }), "Contato salvo.");
}

export async function statusAction(_p: State, form: FormData): Promise<State> {
  const id = String(form.get("creatorId"));
  return run(id, async () => setCreatorStatus(db(), await currentActor(), id, String(form.get("status")) as CreatorStatusValue), "Situação salva.");
}

export async function rateAction(_p: State, form: FormData): Promise<State> {
  const id = String(form.get("creatorId"));
  return run(id, async () => changeRate(db(), await currentActor(), id, percentToBps(String(form.get("rate") ?? ""))), "Taxa nova vale a partir de agora.");
}

export async function rateFixAction(_p: State, form: FormData): Promise<State> {
  const id = String(form.get("creatorId") ?? "");
  return run(id, async () => {
    const r = await correctRateSinceStart(db(), await currentActor(), id, percentToBps(String(form.get("rate") ?? "")));
    return { ok: `Taxa corrigida desde o início: ${r.orders} pedido(s), diferença de ${formatBRL(r.deltaCents)} no extrato.` };
  }, "");
}

const triState = (v: FormDataEntryValue | null) => (v === "sim" ? true : v === "nao" ? false : null);
const dayOrNull = (v: FormDataEntryValue | null) => (typeof v === "string" && v.trim() ? v.trim() : null);

export async function checklistAction(_p: State, form: FormData): Promise<State> {
  const id = String(form.get("creatorId") ?? "");
  return run(
    id,
    async () => {
      const r = await updateChecklist(db(), await currentActor(), id, {
        start: dayOrNull(form.get("start")),
        end: dayOrNull(form.get("end")),
        contractSigned: triState(form.get("contractSigned")),
        couponRegistered: triState(form.get("couponRegistered")),
        followsOnInstagram: triState(form.get("followsOnInstagram")),
        inGroup: triState(form.get("inGroup")),
        tagged: triState(form.get("tagged")),
        note: String(form.get("note") ?? ""),
        templateId: String(form.get("templateId") ?? "") || null,
        receivesAsIndividual: form.get("receivesAsIndividual") === "pf",
      });
      return { ok: r.end ? `Salvo. Contrato até ${r.end.split("-").reverse().join("/")}.` : "Salvo." };
    },
    "",
  );
}

export async function inviteAction(_p: State, form: FormData): Promise<State> {
  const id = String(form.get("creatorId"));
  return run(id, async () => {
    const actor = await currentActor();
    const { token, invite } = await createCreatorInvite(db(), actor, String(form.get("accountId")));
    const origin = (await headers()).get("origin") ?? "";
    const link = `${origin}/convite/${token}`;
    // D-EMAIL: com remetente configurado, o convite também vai por e-mail; sem ele, só o link na tela.
    const mail = await emailCreatorInvite(db(), configuredSender(), { inviteId: invite.id, actorId: actor!.userId, link });
    if (!mail) return { link };
    return mail.sent ? { link, ok: `Convite enviado por e-mail para ${mail.to}.` } : { link, error: `O e-mail não foi enviado (${mail.reason}) Mande o link pelo WhatsApp.` };
  }, "");
}

export async function adjustAction(_p: State, form: FormData): Promise<State> {
  const id = String(form.get("creatorId"));
  return run(id, async () => {
    const r = await createAdjustment(db(), await currentActor(), {
      creatorId: id,
      amountCents: brlToCents(String(form.get("amount") ?? "")),
      reason: String(form.get("reason") ?? ""),
      requestId: String(form.get("requestId") ?? ""),
    });
    return { ok: r.created ? "Ajuste lançado no extrato." : "Este ajuste já tinha sido lançado." };
  }, "");
}

export async function reviewedAction(_p: State, form: FormData): Promise<State> {
  const id = String(form.get("creatorId"));
  return run(id, async () => markReviewed(db(), await currentActor(), id), "Conferência registrada.");
}

export async function couponCreateAction(_p: State, form: FormData): Promise<State> {
  const id = String(form.get("creatorId") ?? "");
  return run(
    id,
    async () => {
      const r = await createCouponInShopify(db(), await currentActor(), {
        creatorId: id,
        code: String(form.get("code") ?? ""),
        discountBps: percentToBps(String(form.get("discount") ?? "")),
      });
      return { ok: `Cupom ${r.code} criado na Shopify e ligado à creator.` };
    },
    "",
  );
}

export async function ugcVideoAction(_p: State, form: FormData): Promise<State> {
  const id = String(form.get("creatorId") ?? "");
  return run(id, async () => {
    await addUgcVideo(db(), await currentActor(), {
      creatorId: id,
      url: String(form.get("url") ?? ""),
      day: String(form.get("day") ?? ""),
      product: String(form.get("product") ?? ""),
    });
  }, "Vídeo registrado.");
}

export async function ugcVideoRemoveAction(_p: State, form: FormData): Promise<State> {
  const id = String(form.get("creatorId") ?? "");
  return run(id, async () => removeUgcVideo(db(), await currentActor(), String(form.get("videoId") ?? "")), "Vídeo retirado da contagem.");
}

export async function ugcGoalAction(_p: State, form: FormData): Promise<State> {
  const id = String(form.get("creatorId") ?? "");
  return run(id, async () => setUgcVideoGoal(db(), await currentActor(), id, Number(String(form.get("goal") ?? "").trim() || NaN)), "Meta salva.");
}

/** D-AUTENTIQUE: envia o contrato da creator para assinar no Autentique. */
export async function sendContractAction(_prev: State, form: FormData): Promise<State> {
  const id = String(form.get("creatorId") ?? "");
  return run(id, async () => {
    const r = await sendContract(db(), await currentActor(), id);
    return { ok: `Contrato enviado pelo Autentique para ${r.email}${r.sandbox ? " (modo teste)" : ""}. O sistema confere a assinatura a cada 5 minutos.` };
  }, "Enviado.");
}

/** D-AUTENTIQUE: confere agora se ela assinou (sem esperar a rodada de 5 minutos). */
export async function checkContractAction(_prev: State, form: FormData): Promise<State> {
  const id = String(form.get("creatorId") ?? "");
  return run(id, async () => {
    const r = await checkCreatorContracts(db(), await currentActor(), id);
    if (r.signed) return { ok: "Assinado! Contrato marcado na ficha e kit de boas-vindas liberado." + (r.coupons ? " Cupom criado na Shopify." : "") };
    if (r.rejected) return { error: "Ela recusou o contrato no Autentique. Veja o motivo abaixo." };
    if (r.coupons) return { ok: "Cupom criado na Shopify." };
    if (r.errors) return { error: "Não foi possível conferir agora; veja o erro abaixo." };
    return { ok: "Ainda não assinou." };
  }, "Conferido.");
}

/** M0.2: observação da equipe na linha do tempo (só a equipe vê). */
export async function noteAction(_p: State, form: FormData): Promise<State> {
  const id = String(form.get("creatorId"));
  return run(id, async () => void (await addCreatorNote(db(), await currentActor(), id, String(form.get("body") ?? ""))), "Observação salva.");
}

/**
 * Comissão e desconto juntos, no topo da ficha (D-RATEDISCOUNT). O desconto vai primeiro (Shopify); a comissão vale
 * para pedidos pagos daqui pra frente. Se o desconto passar e a comissão não, a mensagem diz o que ficou salvo.
 */
export async function pricingAction(_p: State, form: FormData): Promise<State> {
  const id = String(form.get("creatorId") ?? "");
  const rate = form.get("rate");
  const discount = form.get("discount");
  return run(id, async () => {
    const actor = await currentActor();
    const done: string[] = [];
    if (typeof discount === "string" && discount.trim()) {
      const r = await changeCouponDiscount(db(), actor, { creatorId: id, discountBps: percentToBps(discount) });
      if (r.changed) done.push(`desconto do cupom ${r.code} mudado na Shopify`);
    }
    if (typeof rate === "string" && rate.trim()) {
      try {
        const before = await db().commissionPolicy.findFirst({ where: { creatorId: id, validTo: null }, select: { rateBps: true } });
        const rateBps = percentToBps(rate);
        await changeRate(db(), actor, id, rateBps);
        if (before && before.rateBps !== rateBps) done.push("comissão nova vale para pedidos pagos a partir de agora");
      } catch (error) {
        if (done.length && (error instanceof ProfileError || error instanceof ReviewError)) return { error: `Desconto salvo, mas a comissão não: ${error.message}` };
        throw error;
      }
    }
    return { ok: done.length ? `Salvo: ${done.join("; ")}.` : "Nada mudou." };
  }, "");
}

/** M4.2 (D-TAGS): marcar e tirar tags da creator. */
export async function addTagAction(_p: State, form: FormData): Promise<State> {
  const id = String(form.get("creatorId") ?? "");
  return run(id, async () => {
    const tag = await addCreatorTag(db(), await currentActor(), id, String(form.get("tag") ?? ""));
    return { ok: `Tag "${tag.name}" marcada.` };
  }, "Tag marcada.");
}

export async function removeTagAction(_p: State, form: FormData): Promise<State> {
  const id = String(form.get("creatorId") ?? "");
  return run(id, async () => removeCreatorTag(db(), await currentActor(), id, String(form.get("tagId") ?? "")), "Tag retirada.");
}

/** M4.3 (D-PROFILEFIELDS): perfil opcional (registro, nichos, redes, alergias, mídia kit). */
export async function profileAction(_p: State, form: FormData): Promise<State> {
  const id = String(form.get("creatorId") ?? "");
  const f = (k: string) => String(form.get(k) ?? "");
  return run(id, async () => updateProfile(db(), await currentActor(), id, {
    professionalId: f("professionalId"), niches: form.getAll("niches").map(String), youtube: f("youtube"), kwai: f("kwai"), allergies: f("allergies"), mediaKitUrl: f("mediaKitUrl"),
  }), "Perfil salvo.");
}
