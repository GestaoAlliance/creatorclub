import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { recordHunterClick, resolveHunterLink } from "@/lib/onboarding/hunters";

export const dynamic = "force-dynamic";

// D-HUNTERLINKBRAND: link do hunter por marca (/i/[codigo]/[marca]): conta o clique nessa marca e abre o formulário
// dela. Código desconhecido na marca: abre o formulário da marca sem hunter; marca desconhecida: a escolha de marca.
export async function GET(request: NextRequest, ctx: RouteContext<"/i/[codigo]/[marca]">) {
  const { codigo, marca } = await ctx.params;
  const r = await resolveHunterLink(db(), marca, "inscricao", codigo);
  if (!r) return NextResponse.redirect(new URL("/inscricao", request.url), 302);
  if (r.click) {
    try {
      await recordHunterClick(db(), r.click, {
        ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
        userAgent: request.headers.get("user-agent"),
      });
    } catch (error) {
      console.error("hunter.click", error); // nunca impede a pessoa de chegar ao formulário
    }
  }
  return NextResponse.redirect(new URL(r.url, request.url), 302);
}
