"use server";

import { headers } from "next/headers";
import { SIGNUP_QUESTIONS } from "@/domain";
import { db } from "@/lib/db";
import { ApplicationError } from "@/lib/onboarding/applications";
import { submitSignup } from "@/lib/onboarding/signup";

export type SignupState = { done?: boolean; errors?: Record<string, string>; values?: Record<string, string>; n: number };

/** Envio do formulário de inscrição (D-SIGNUP). Em erro devolve o que foi digitado para nada se perder. */
export async function signupAction(marca: string, prev: SignupState, form: FormData): Promise<SignupState> {
  const values: Record<string, string> = Object.fromEntries(SIGNUP_QUESTIONS.map((q) => [q.key, String(form.get(q.key) ?? "")]));
  try {
    const r = await submitSignup(db(), {
      brandSlug: marca,
      values,
      consent: form.get("consent") === "sim",
      honeypot: String(form.get("site") ?? ""),
      hunterCode: String(form.get("h") ?? "") || null,
      ip: (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    });
    return r.ok ? { done: true, n: prev.n + 1 } : { errors: r.errors, values: { ...values, consent: form.get("consent") === "sim" ? "sim" : "" }, n: prev.n + 1 };
  } catch (error) {
    if (error instanceof ApplicationError) return { errors: { _form: error.message }, values, n: prev.n + 1 };
    console.error("signup", error);
    return { errors: { _form: "Não foi possível enviar agora. Tente de novo em instantes." }, values, n: prev.n + 1 };
  }
}
