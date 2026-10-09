"use server";

import { revalidatePath } from "next/cache";
import { currentActor } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { payWithdrawal, rejectWithdrawal, WithdrawalDecisionError } from "@/lib/withdrawals/decide";

export type ActionState = { error?: string; ok?: string } | undefined;

async function run(fn: () => Promise<void>, ok: string): Promise<ActionState> {
  try {
    await fn();
    revalidatePath("/admin/saques");
    return { ok };
  } catch (error) {
    if (error instanceof WithdrawalDecisionError) return { error: error.message };
    throw error;
  }
}

export async function payAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return run(async () => payWithdrawal(db(), await currentActor(), String(form.get("withdrawalId"))), "Marcado como pago.");
}

export async function rejectAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return run(async () => rejectWithdrawal(db(), await currentActor(), String(form.get("withdrawalId")), String(form.get("reason") ?? "")), "Saque recusado.");
}
