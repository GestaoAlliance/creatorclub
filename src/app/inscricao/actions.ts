"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { PROFILE_KEYS, SIGNUP_ADDRESS_PARTS, SIGNUP_QUESTIONS, signupCouponPreview, signupCouponValid } from "@/domain";
import { lookupCnpj } from "@/lib/cnpj/lookup";
import { db } from "@/lib/db";
import { ApplicationError } from "@/lib/onboarding/applications";
import { requestPortalAccess, signupCouponTaken, submitSignup, type SignupAuth } from "@/lib/onboarding/signup";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";

/** `existing: "request"`: já tem cadastro sem senha; o formulário vira o pedido do link de acesso (D-ACCESSREQ). */
export type SignupState = { errors?: Record<string, string>; values?: Record<string, string>; existing?: "request"; n: number };

/** Login do cadastro no Supabase Auth (D-SIGNUPACCOUNT): e-mail já confirmado, como no convite. */
const supabaseSignupAuth: SignupAuth = {
  async createUser(email, password) {
    const r = await supabaseAdmin().auth.admin.createUser({ email, password, email_confirm: true });
    if (r.data.user) return { userId: r.data.user.id };
    return { error: /already|registered|exists/i.test(r.error?.message ?? "") ? "exists" : "failed" };
  },
  async deleteUser(userId) {
    await supabaseAdmin().auth.admin.deleteUser(userId);
  },
};

/**
 * Cadastro de creator de uma marca (D-SIGNUPACCOUNT): cria a conta com senha e a inscrição, entra e leva ao aviso de
 * "cadastro em análise". Em erro devolve o que foi digitado (menos a senha) para nada se perder.
 */
export async function signupAction(prev: SignupState, form: FormData): Promise<SignupState> {
  const values: Record<string, string> = Object.fromEntries([
    ...SIGNUP_QUESTIONS.filter((q) => q.key !== "address").map((q) => [q.key, String(form.get(q.key) ?? "")]),
    ...SIGNUP_ADDRESS_PARTS.map((k) => [k, String(form.get(k) ?? "")]),
    // M4.3 (D-PROFILEFIELDS): perfil opcional; nichos chegam marcados um a um.
    ...PROFILE_KEYS.map((k) => [k, k === "niches" ? form.getAll(k).map(String).join("|") : String(form.get(k) ?? "")]),
    // D-ORIGIN: "Como conheceu a marca?" (opcional).
    ["heardFrom", String(form.get("heardFrom") ?? "")],
    ["heardFromOther", String(form.get("heardFromOther") ?? "")],
  ]);
  const password = String(form.get("password") ?? "");
  let email: string | null;
  try {
    const r = await submitSignup(
      db(),
      {
        brandSlug: String(form.get("marca") ?? ""),
        values,
        password,
        honeypot: String(form.get("site") ?? ""),
        hunterCode: String(form.get("h") ?? "") || null,
        campaignTag: String(form.get("origem") ?? "") || null,
        ip: (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      },
      supabaseSignupAuth,
    );
    if (!r.ok) return r.existing ? { existing: r.existing, values, n: prev.n + 1 } : { errors: r.errors, values, n: prev.n + 1 };
    email = r.email;
  } catch (error) {
    if (error instanceof ApplicationError) return { errors: { _form: error.message }, values, n: prev.n + 1 };
    console.error("signup", error);
    return { errors: { _form: "Não foi possível criar a conta agora. Tente de novo em instantes." }, values, n: prev.n + 1 };
  }
  // Robô (campo invisível): nada foi criado; mostra a mesma tela de sucesso sem entrar.
  if (!email) redirect("/entrar");
  const signedIn = await (await supabaseServer()).auth.signInWithPassword({ email, password });
  if (signedIn.error) redirect(`/entrar?next=/conta`);
  redirect("/conta");
}

export type CnpjAddressResult = { legalName: string; mei: boolean | null; address: { zip: string; street: string; number: string; complement: string | null; district: string; city: string; state: string } } | { state: "notfound" | "unavailable" };

/** D-PJADDR: endereço do CNPJ (dados públicos da Receita) para preencher a entrega de quem não é MEI. */
export async function cnpjAddressAction(cnpj: string): Promise<CnpjAddressResult> {
  const info = await lookupCnpj(cnpj);
  return typeof info === "string" ? { state: info } : { legalName: info.legalName, mei: info.mei, address: info.address };
}

export type CouponCheck = { code: string; state: "ok" | "taken" | "invalid" };

/** Aviso na hora se o cupom escolhido já está em uso na marca (só o banco do sistema, nunca a Shopify). */
export async function checkCouponAction(marca: string, raw: string): Promise<CouponCheck> {
  const code = signupCouponPreview(raw);
  if (!signupCouponValid(code)) return { code, state: "invalid" };
  const brand = await db().brand.findUnique({ where: { slug: marca.toLowerCase() }, select: { id: true } });
  if (!brand) return { code, state: "invalid" };
  return { code, state: (await signupCouponTaken(db(), brand.id, code)) ? "taken" : "ok" };
}

/** D-ACCESSREQ: "Pedir meu link de acesso". Mesma resposta, ache ou não a conta (nada é revelado). */
export async function requestAccessAction(values: Record<string, string>): Promise<{ ok: true }> {
  try {
    await requestPortalAccess(db(), values);
  } catch (error) {
    console.error("signup.access_request", error);
  }
  return { ok: true };
}
