import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { canonicalRedirect } from "@/lib/site";

// Renova a sessão do Supabase Auth (cookies) a cada navegação. Não decide acesso:
// quem pode ver o quê é checado no servidor, em cada página e ação.
// D-DOMAIN: tela aberta pelo endereço antigo da Vercel vai para o domínio novo (mesmo caminho).
export async function proxy(request: NextRequest) {
  const to = canonicalRedirect({ method: request.method, host: request.headers.get("host"), pathname: request.nextUrl.pathname, search: request.nextUrl.search });
  if (to) return NextResponse.redirect(to, 308);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  let response = NextResponse.next({ request });
  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet) => {
        for (const { name, value } of toSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of toSet) response.cookies.set(name, value, options);
      },
    },
  });
  await supabase.auth.getClaims();
  return response;
}

export const config = {
  matcher: ["/((?!api/health|api/ready|api/jobs|api/webhooks|api/forms|api/mcp|oauth/token|oauth/register|\\.well-known|r/|_next/static|_next/image|favicon.ico).*)"],
};
