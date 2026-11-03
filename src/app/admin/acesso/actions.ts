"use server";

import { headers } from "next/headers";
import { publicOrigin } from "@/lib/site";
import { AccessError, changeLoginEmail, emailPasswordReset, passwordResetLink, setTemporaryPassword } from "@/lib/auth/access";
import { currentActor } from "@/lib/auth/current";
import { supabaseAuthAdmin, supabaseRecoveryToken } from "@/lib/auth/recovery";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { configuredSender } from "@/lib/email/sender";

export type ResetState = { error?: string; ok?: string; link?: string; password?: string; email?: string } | undefined;

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

/** D-ACCESSFIX: senha provisória (aparece uma vez) para mandar pelo WhatsApp. */
export async function temporaryPasswordAction(_prev: ResetState, form: FormData): Promise<ResetState> {
  try {
    const r = await setTemporaryPassword(db(), await currentActor(), String(form.get("userId") ?? ""), supabaseAuthAdmin);
    return { ok: "Senha provisória criada. Ela aparece só agora: mande pelo WhatsApp.", password: r.password, email: r.email };
  } catch (error) {
    if (error instanceof AccessError) return { error: error.message };
    throw error;
  }
}

/** D-ACCESSFIX: corrige o e-mail de login (a senha continua a mesma). */
export async function loginEmailAction(_prev: ResetState, form: FormData): Promise<ResetState> {
  try {
    const email = await changeLoginEmail(db(), await currentActor(), String(form.get("userId") ?? ""), String(form.get("email") ?? ""), supabaseAuthAdmin);
    revalidatePath("/admin", "layout");
    return { ok: `Pronto: agora ela entra com ${email} (a senha continua a mesma).`, email };
  } catch (error) {
    if (error instanceof AccessError) return { error: error.message };
    throw error;
  }
}
