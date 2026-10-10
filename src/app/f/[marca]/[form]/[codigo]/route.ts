import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { recordHunterClick, resolveHunterLink } from "@/lib/onboarding/hunters";

export const dynamic = "force-dynamic";

// Link do hunter (D-HUNTERLINK): conta o clique antes de responder e abre o formulário com o código preenchido.
export async function GET(request: NextRequest, ctx: RouteContext<"/f/[marca]/[form]/[codigo]">) {
  const { marca, form, codigo } = await ctx.params;
  const target = await resolveHunterLink(db(), marca, form, codigo);
  if (!target) return new NextResponse("Link não encontrado.", { status: 404 });
  if (target.click) {
    try {
      await recordHunterClick(db(), target.click, {
        ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
        userAgent: request.headers.get("user-agent"),
      });
    } catch (error) {
      // Falha ao contar o clique nunca impede a pessoa de chegar ao formulário.
      console.error("hunter.click", error);
    }
  }
  return NextResponse.redirect(target.url, 302);
}
