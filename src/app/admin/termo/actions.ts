"use server";

import { revalidatePath } from "next/cache";
import { currentActor } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { publishTerms, TermsError } from "@/lib/terms/terms";

export type ActionState = { error?: string; ok?: string } | undefined;

export async function publishTermsAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { version } = await publishTerms(db(), await currentActor(), {
      brandId: String(form.get("brandId") ?? ""),
      title: String(form.get("title") ?? ""),
      body: String(form.get("body") ?? ""),
    });
    revalidatePath("/admin/termo");
    return { ok: `Versão ${version} publicada. As creators vão aceitar de novo no próximo acesso.` };
  } catch (error) {
    if (error instanceof TermsError) return { error: error.message };
    throw error;
  }
}
