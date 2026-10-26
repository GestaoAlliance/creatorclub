"use server";

import { redirect } from "next/navigation";
import { safeNextPath } from "@/lib/auth/rules";
import { supabaseServer } from "@/lib/supabase/server";

/** Confere o código de nova senha só quando a pessoa toca no botão (a prévia do WhatsApp abre o link e gastava o código). */
export async function confirmRecoveryAction(form: FormData): Promise<void> {
  const tokenHash = String(form.get("token_hash") ?? "");
  const next = safeNextPath(form.get("next"));
  if (tokenHash) {
    const supabase = await supabaseServer();
    const { error } = await supabase.auth.verifyOtp({ type: "recovery", token_hash: tokenHash });
    if (!error) redirect(next);
  }
  redirect("/entrar?erro=link");
}
