"use server";

import { redirect } from "next/navigation";
import { passwordProblem } from "@/lib/auth/rules";
import { db } from "@/lib/db";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";
import { acceptStaffInvite, inviteByToken, TeamError } from "@/lib/team/invites";

export type AcceptState = { error?: string } | undefined;

export async function acceptInviteAction(_prev: AcceptState, form: FormData): Promise<AcceptState> {
  const token = String(form.get("token") ?? "");
  const { invite, state } = await inviteByToken(db(), token);
  if (!invite || state !== "valid") return { error: "Convite inválido, expirado ou já usado." };

  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getClaims();
  let userId = typeof data?.claims?.sub === "string" ? data.claims.sub : null;
  let email = typeof data?.claims?.email === "string" ? data.claims.email : null;

  if (!userId) {
    // Sem sessão: cria o login com o e-mail do convite e a senha escolhida.
    const password = form.get("password");
    const problem = passwordProblem(password);
    if (problem) return { error: problem };
    if (password !== form.get("confirm")) return { error: "As duas senhas não são iguais." };
    const created = await supabaseAdmin().auth.admin.createUser({
      email: invite.email,
      password: password as string,
      email_confirm: true,
    });
    if (created.error || !created.data.user) {
      return { error: "Já existe uma conta com este e-mail. Entre com ela e abra o convite de novo." };
    }
    const signedIn = await supabase.auth.signInWithPassword({ email: invite.email, password: password as string });
    if (signedIn.error) return { error: "Conta criada, mas não foi possível entrar. Tente pelo login." };
    userId = created.data.user.id;
    email = invite.email;
  }

  try {
    await acceptStaffInvite(db(), token, { userId, email: email ?? "" });
  } catch (error) {
    if (error instanceof TeamError) return { error: error.message };
    throw error;
  }
  redirect("/conta");
}
