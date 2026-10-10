"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { currentActor } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { currentPortalContext } from "@/lib/portal/current";
import { acceptTerms, TermsError } from "@/lib/terms/terms";

export type TermsState = { error?: string } | undefined;

export async function acceptTermsAction(_prev: TermsState, form: FormData): Promise<TermsState> {
  const marca = String(form.get("marca") ?? "");
  try {
    const ctx = await currentPortalContext(marca);
    const actor = await currentActor();
    if (!actor) return { error: "Sua sessão expirou. Entre de novo." };
    const h = await headers();
    await acceptTerms(db(), ctx, {
      actorUserId: actor.userId,
      termsVersionId: String(form.get("termsVersionId") ?? ""),
      fullName: String(form.get("fullName") ?? ""),
      cpf: String(form.get("cpf") ?? ""),
      accept: form.get("accept") === "on",
      ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip"),
      userAgent: h.get("user-agent"),
    });
  } catch (error) {
    if (error instanceof TermsError) return { error: error.message };
    throw error;
  }
  redirect(`/portal/${marca}`);
}
