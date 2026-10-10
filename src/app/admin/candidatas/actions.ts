"use server";

import { revalidatePath } from "next/cache";
import { currentActor } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { approveApplication, ApplicationError, rejectApplication, type Category } from "@/lib/onboarding/applications";
import { percentToBps, ReviewError } from "@/lib/coupons/review";
import { createCreatorInvite } from "@/lib/team/creator-invites";
import { TeamError } from "@/lib/team/invites";
import { headers } from "next/headers";

export type ApproveState = { error?: string; ok?: { name: string; coupon: string; creatorId: string; link: string | null; inviteError?: string } } | undefined;

export async function approveAction(_prev: ApproveState, form: FormData): Promise<ApproveState> {
  const actor = await currentActor();
  try {
    const r = await approveApplication(db(), actor, {
      applicationId: String(form.get("applicationId") ?? ""),
      couponCode: String(form.get("coupon") ?? ""),
      category: String(form.get("category") ?? "") as Category,
      rateBps: percentToBps(String(form.get("rate") ?? "")),
      discountBps: percentToBps(String(form.get("discount") ?? "")),
      email: String(form.get("email") ?? ""),
    });
    revalidatePath("/admin/candidatas");
    // O convite sai logo depois; se falhar (ex.: pessoa já tem login), a creator já está criada e o aviso aparece.
    let link: string | null = null;
    let inviteError: string | undefined;
    try {
      const { token } = await createCreatorInvite(db(), actor, r.accountId);
      const origin = (await headers()).get("origin") ?? "";
      link = `${origin}/convite/${token}`;
    } catch (error) {
      if (!(error instanceof TeamError)) throw error;
      inviteError = error.message;
    }
    return { ok: { name: String(form.get("name") ?? ""), coupon: r.couponCode, creatorId: r.creatorId, link, ...(inviteError ? { inviteError } : {}) } };
  } catch (error) {
    if (error instanceof ApplicationError || error instanceof ReviewError) return { error: error.message };
    throw error;
  }
}

export type RejectState = { error?: string; ok?: string } | undefined;

export async function rejectAction(_prev: RejectState, form: FormData): Promise<RejectState> {
  try {
    await rejectApplication(db(), await currentActor(), String(form.get("applicationId") ?? ""), String(form.get("note") ?? ""));
    revalidatePath("/admin/candidatas");
    return { ok: "Candidata recusada." };
  } catch (error) {
    if (error instanceof ApplicationError) return { error: error.message };
    throw error;
  }
}
