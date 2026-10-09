"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { normalizeEmail, passwordProblem, safeNextPath } from "@/lib/auth/rules";
import { supabaseServer } from "@/lib/supabase/server";

export type FormState = { error?: string; ok?: string } | undefined;

export async function signIn(_prev: FormState, form: FormData): Promise<FormState> {
  const email = normalizeEmail(form.get("email"));
  const password = form.get("password");
  if (!email || typeof password !== "string" || !password) return { error: "Informe e-mail e senha." };

  const supabase = await supabaseServer();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  // Mensagem única: não revela se o e-mail existe.
  if (error) return { error: "E-mail ou senha incorretos, ou muitas tentativas. Tente de novo em instantes." };
  redirect(safeNextPath(form.get("next")));
}

export async function signOut(): Promise<void> {
  const supabase = await supabaseServer();
  await supabase.auth.signOut();
  redirect("/entrar");
}

export async function requestPasswordReset(_prev: FormState, form: FormData): Promise<FormState> {
  const email = normalizeEmail(form.get("email"));
  if (!email) return { error: "Informe um e-mail válido." };
  const origin = (await headers()).get("origin") ?? "";
  const supabase = await supabaseServer();
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/callback?next=/entrar/nova-senha`,
  });
  // Mesma resposta exista ou não a conta.
  return { ok: "Se houver uma conta com esse e-mail, enviamos um link para criar uma nova senha." };
}

export async function updatePassword(_prev: FormState, form: FormData): Promise<FormState> {
  const password = form.get("password");
  const problem = passwordProblem(password);
  if (problem) return { error: problem };
  if (password !== form.get("confirm")) return { error: "As duas senhas não são iguais." };
  const supabase = await supabaseServer();
  const { error } = await supabase.auth.updateUser({ password: password as string });
  if (error) return { error: "Não foi possível trocar a senha. Peça um novo link." };
  redirect("/conta");
}
