import type { NextRequest } from "next/server";
import { dayKey, salesCsv } from "@/domain";
import { can } from "@/lib/auth/permissions";
import { currentActor } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { salesForCsv } from "@/lib/sales/list";
import { staffContext } from "@/lib/staff/context";
import { filtersOf, salesPeriod } from "../filters";

export const dynamic = "force-dynamic";

// CSV da tela de vendas (M0.1): os mesmos filtros, só para quem vê dinheiro na marca escolhida.
export async function GET(request: NextRequest) {
  const actor = await currentActor();
  if (!actor) return new Response("Entre para baixar.", { status: 401 });
  const { brand } = await staffContext(actor);
  if (!brand || !can(actor.grants, "money.view", brand.id)) return new Response("Sem permissão.", { status: 403 });
  const sp = Object.fromEntries(request.nextUrl.searchParams.entries());
  const { timezone } = await db().brand.findUniqueOrThrow({ where: { id: brand.id }, select: { timezone: true } });
  const rows = await salesForCsv(db(), brand.id, filtersOf(sp, salesPeriod(sp, timezone)));
  return new Response(salesCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="vendas-${brand.slug}-${dayKey(new Date())}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
