import { NextResponse, type NextRequest } from "next/server";
import { SIGNUP_DEFAULT_BRAND } from "@/domain";
import { db } from "@/lib/db";
import { recordHunterClick, resolveHunterLink } from "@/lib/onboarding/hunters";

export const dynamic = "force-dynamic";

// Link curto do hunter (D-SIGNUP): /i/[codigo] conta o clique e abre a inscrição com o código. Sem marca no endereço.
export async function GET(request: NextRequest, ctx: RouteContext<"/i/[codigo]">) {
  const { codigo } = await ctx.params;
  const target = await resolveHunterLink(db(), SIGNUP_DEFAULT_BRAND, "inscricao", codigo);
  if (!target) return NextResponse.redirect(new URL("/inscricao", request.url), 302);
  if (target.click) {
    try {
      await recordHunterClick(db(), target.click, {
        ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
        userAgent: request.headers.get("user-agent"),
      });
    } catch (error) {
      console.error("hunter.click", error); // nunca impede a pessoa de chegar ao formulário
    }
  }
  return NextResponse.redirect(new URL(target.url, request.url), 302);
}
