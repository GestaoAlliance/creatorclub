"use server";

import { headers } from "next/headers";
import { publicOrigin } from "@/lib/site";
import { AccessError, emailPasswordReset, passwordResetLink } from "@/lib/auth/access";
import { currentActor } from "@/lib/auth/current";
import { supabaseRecoveryToken } from "@/lib/auth/recovery";
import { db } from "@/lib/db";
import { configuredSender } from "@/lib/email/sender";

export type ResetState = { error?: string; ok?: string; link?: string } | undefined;

const originOf = async () => publicOrigin(await headers());

/** M4.4b (D-ACCESS): nova senha — link para o WhatsApp ou e-mail. */
export async function resetPasswordAction(_prev: ResetState, form: FormData): Promise<ResetState> {
  const userId = String(form.get("userId") ?? "");
  try {
    if (form.get("how") === "email") {
      const to = await emailPasswordReset(db(), await currentActor(), userId, await originOf(), supabaseRecoveryToken, configuredSender());
      return { ok: `Link de nova senha enviado para ${to}.` };
    }
    const link = await passwordResetLink(db(), await currentActor(), userId, await originOf(), supabaseRecoveryToken);
    return { ok: "Link de nova senha (uso único, vale 1 hora). Copie e mande pelo WhatsApp:", link };
  } catch (error) {
    if (error instanceof AccessError) return { error: error.message };
    throw error;
  }
}
