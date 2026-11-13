import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { recordHunterClick, signupLinksFor } from "@/lib/onboarding/hunters";

export const dynamic = "force-dynamic";

// Link curto do hunter (D-SIGNUPBRAND): /i/[codigo] conta o clique e abre o formulário da marca do hunter. Código
// desconhecido (ou de quem não é mais hunter): abre a escolha de marca, sem contar clique.
export async function GET(request: NextRequest, ctx: RouteContext<"/i/[codigo]">) {
  const { codigo } = await ctx.params;
  const all = await signupLinksFor(db(), codigo);
  // D-HUNTERMULTI: hunter de mais de uma marca: primeiro a escolha da marca; a escolha volta aqui com ?m=marca para
  // contar o clique na marca escolhida.
  const m = request.nextUrl.searchParams.get("m");
  const links = all.length > 1 && m ? all.filter((l) => l.slug === m) : all;
  if (links.length !== 1) {
    const code = links[0]?.code;
    return NextResponse.redirect(new URL(code ? `/inscricao?h=${encodeURIComponent(code)}` : "/inscricao", request.url), 302);
  }
  const link = links[0]!;
  try {
    await recordHunterClick(db(), link.click, {
      ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      userAgent: request.headers.get("user-agent"),
    });
  } catch (error) {
    console.error("hunter.click", error); // nunca impede a pessoa de chegar ao formulário
  }
  return NextResponse.redirect(new URL(`/inscricao/${link.slug}?h=${encodeURIComponent(link.code)}`, request.url), 302);
}
