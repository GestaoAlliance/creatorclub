import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { recordClick, resolveTrackedLink, safeStorePath } from "@/lib/links/tracked";

export const dynamic = "force-dynamic";

// Link rastreado da creator (D-LINK). O clique é gravado antes de responder (nada roda depois da resposta).
export async function GET(request: NextRequest, ctx: RouteContext<"/r/[marca]/[codigo]">) {
  const { marca, codigo } = await ctx.params;
  const path = safeStorePath(request.nextUrl.searchParams.get("redirect"));
  const target = await resolveTrackedLink(db(), marca, codigo, path);
  if (!target) return new NextResponse("Link não encontrado.", { status: 404 });
  if (target.click) {
    try {
      await recordClick(db(), target.click, {
        ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
        userAgent: request.headers.get("user-agent"),
        referrer: request.headers.get("referer"),
        landing: request.nextUrl.pathname + request.nextUrl.search,
      });
    } catch (error) {
      // Falha ao contar o clique nunca impede a compra: a pessoa segue para a loja.
      console.error("click.record", error);
    }
  }
  return NextResponse.redirect(target.url, 302);
}
