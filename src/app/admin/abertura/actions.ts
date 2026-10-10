"use server";

import { revalidatePath } from "next/cache";
import { currentActor } from "@/lib/auth/current";
import { AdjustError, brlToCents } from "@/lib/commission/adjust";
import { db } from "@/lib/db";
import { approveOpening, OpeningError } from "@/lib/withdrawals/opening";

export type ActionState = { error?: string; ok?: string } | undefined;

export async function approveOpeningAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const raw = String(form.get("paid") ?? "").trim();
    const alreadyPaidCents = raw === "" ? 0 : brlToCents(raw);
    await approveOpening(db(), await currentActor(), {
      creatorId: String(form.get("creatorId") ?? ""),
      alreadyPaidCents,
      note: String(form.get("note") ?? ""),
    });
    revalidatePath("/admin/abertura");
    return { ok: "Aprovado. Saque liberado." };
  } catch (error) {
    if (error instanceof OpeningError || error instanceof AdjustError) return { error: error.message };
    throw error;
  }
}
