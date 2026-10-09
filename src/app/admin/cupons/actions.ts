"use server";

import { revalidatePath } from "next/cache";
import { currentActor } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { classifyCoupon, confirmOwner, confirmRate, percentToBps, ReviewError } from "@/lib/coupons/review";

export type ActionState = { error?: string; ok?: string } | undefined;

async function run(fn: () => Promise<void>, ok: string): Promise<ActionState> {
  try {
    await fn();
    revalidatePath("/admin/cupons");
    return { ok };
  } catch (error) {
    if (error instanceof ReviewError) return { error: error.message };
    throw error;
  }
}

export async function classifyAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const kind = form.get("kind") === "PROMO" ? "PROMO" : "CREATOR";
  return run(async () => classifyCoupon(db(), await currentActor(), String(form.get("couponId")), kind), "Tipo salvo.");
}

export async function confirmOwnerAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const since = String(form.get("since") ?? "");
  return run(
    async () =>
      confirmOwner(db(), await currentActor(), {
        couponId: String(form.get("couponId")),
        creatorId: String(form.get("creatorId")),
        ...(since ? { since: new Date(`${since}T00:00:00-03:00`) } : {}),
      }),
    "Dona confirmada.",
  );
}

export async function confirmRateAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return run(
    async () => confirmRate(db(), await currentActor(), { policyId: String(form.get("policyId")), rateBps: percentToBps(String(form.get("rate") ?? "")) }),
    "Taxa confirmada.",
  );
}
