import { NextResponse, type NextRequest } from "next/server";
import { normalizeEmail, safeNextPath } from "@/lib/auth/rules";
import { supabaseServer } from "@/lib/supabase/server";

/**
 * D-SAVEPASSWORD: o login é um envio de formulário comum (POST e nova página), não uma ação em segundo plano. Assim
 * o navegador (Chrome, Safari no iPhone, gerenciadores de senha) percebe que deu certo e oferece "Salvar senha".
 * Erro volta para /entrar com a mesma mensagem de sempre (não revela se a conta existe).
 */
export async function POST(request: NextRequest): Promise<Response> {
  const form = await request.formData();
  const next = safeNextPath(form.get("next"));
  const email = normalizeEmail(form.get("email"));
  const password = form.get("password");
  const back = (erro: string) => {
    const url = new URL("/entrar", request.url);
    url.searchParams.set("erro", erro);
    if (next !== safeNextPath(undefined)) url.searchParams.set("next", next);
    if (email) url.searchParams.set("email", email);
    return NextResponse.redirect(url, 303);
  };
  if (!email || typeof password !== "string" || !password) return back("vazio");
  try {
    const supabase = await supabaseServer();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return back("senha");
  } catch {
    return back("senha");
  }
  return NextResponse.redirect(new URL(next, request.url), 303);
}
