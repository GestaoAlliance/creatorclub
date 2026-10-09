import { NextResponse, type NextRequest } from "next/server";
import { safeNextPath } from "@/lib/auth/rules";
import { supabaseServer } from "@/lib/supabase/server";

// Volta dos links enviados por e-mail (nova senha; depois, convites): troca o código por sessão.
export async function GET(request: NextRequest): Promise<Response> {
  const code = request.nextUrl.searchParams.get("code");
  const next = safeNextPath(request.nextUrl.searchParams.get("next"));
  if (code) {
    const supabase = await supabaseServer();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, request.url));
  }
  return NextResponse.redirect(new URL("/entrar?erro=link", request.url));
}
