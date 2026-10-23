import { NextResponse, type NextRequest } from "next/server";
import { safeNextPath } from "@/lib/auth/rules";
import { supabaseServer } from "@/lib/supabase/server";

// Link de nova senha gerado pela equipe (M4.4b, D-ACCESS): confere o código no servidor e abre a tela de nova senha.
export async function GET(request: NextRequest): Promise<Response> {
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type");
  const next = safeNextPath(request.nextUrl.searchParams.get("next"));
  if (tokenHash && type === "recovery") {
    const supabase = await supabaseServer();
    const { error } = await supabase.auth.verifyOtp({ type: "recovery", token_hash: tokenHash });
    if (!error) return NextResponse.redirect(new URL(next, request.url));
  }
  return NextResponse.redirect(new URL("/entrar?erro=link", request.url));
}
