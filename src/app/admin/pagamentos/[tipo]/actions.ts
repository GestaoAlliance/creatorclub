"use server";

import { revalidatePath } from "next/cache";
import { currentActor } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { PayCheckError, recordPayCheck, reviewText } from "@/lib/payouts/check";

export type CheckResult = { ok?: string; error?: string; text?: string; amountCents?: number; month?: string; requested?: boolean };

/** D-PAYCHECK: "Conferido" (libera aprovar) ou "Mandar para o Pedro" (em análise, com o texto para o grupo). */
export async function payCheckAction(creatorId: string, status: "CHECKED" | "REVIEW", brandName: string): Promise<CheckResult> {
  try {
    const r = await recordPayCheck(db(), await currentActor(), creatorId, status, null);
    revalidatePath("/admin/pagamentos", "layout");
    if (status === "REVIEW") return { ok: "Marcado como em análise. Texto copiado para colar no grupo.", text: reviewText(r, brandName) };
    return { ok: "Conferido.", amountCents: r.systemCents, month: r.month, requested: r.withdrawal !== null };
  } catch (error) {
    if (error instanceof PayCheckError) return { error: error.message };
    throw error;
  }
}
