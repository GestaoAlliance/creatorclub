"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { currentActor } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { percentToBps, ReviewError } from "@/lib/coupons/review";
import { changeRate, ProfileError, setCreatorStatus, updateContact, type CreatorStatusValue } from "@/lib/creators/profile";
import { createCreatorInvite } from "@/lib/team/creator-invites";
import { AdjustError, brlToCents, createAdjustment } from "@/lib/commission/adjust";
import { TeamError } from "@/lib/team/invites";
import { markReviewed, OpeningError } from "@/lib/withdrawals/opening";
import { correctRateSinceStart, RateFixError } from "@/lib/commission/rate-fix";
import { ContractError, updateChecklist } from "@/lib/creators/contract";
import { formatBRL } from "@/domain";

export type State = { error?: string; ok?: string; link?: string } | undefined;

async function run(id: string, fn: () => Promise<State | void>, ok: string): Promise<State> {
  try {
    const r = await fn();
    revalidatePath(`/admin/creators/${id}`);
    return r ?? { ok };
  } catch (error) {
    if (error instanceof ProfileError || error instanceof ReviewError || error instanceof TeamError || error instanceof AdjustError || error instanceof OpeningError || error instanceof RateFixError || error instanceof ContractError) {
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
      });
      return { ok: r.end ? `Salvo. Contrato até ${r.end.split("-").reverse().join("/")}.` : "Salvo." };
    },
    "",
  );
}

export async function inviteAction(_p: State, form: FormData): Promise<State> {
  const id = String(form.get("creatorId"));
  return run(id, async () => {
    const { token } = await createCreatorInvite(db(), await currentActor(), String(form.get("accountId")));
    const origin = (await headers()).get("origin") ?? "";
    return { link: `${origin}/convite/${token}` };
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
