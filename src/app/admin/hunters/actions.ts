"use server";

import { revalidatePath } from "next/cache";
import { currentActor } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { createHunterLink, HunterError } from "@/lib/onboarding/hunters";

export type HunterState = { error?: string; ok?: string } | undefined;

async function run(fn: () => Promise<unknown>, ok: string): Promise<HunterState> {
  try {
    await fn();
    revalidatePath("/admin/hunters");
    return { ok };
  } catch (error) {
    if (error instanceof HunterError) return { error: error.message };
    throw error;
  }
}

export async function createLinkAction(_p: HunterState, form: FormData): Promise<HunterState> {
  return run(
    async () =>
      createHunterLink(db(), await currentActor(), {
        brandId: String(form.get("brandId") ?? ""),
        userId: String(form.get("userId") ?? ""),
        code: String(form.get("code") ?? ""),
      }),
    "Link criado.",
  );
}
