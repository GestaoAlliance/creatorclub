import type { PrismaClient } from "@/generated/prisma/client";
import { monthKey } from "@/domain";
import type { Actor } from "@/lib/auth/actor";
import { scopeGrants } from "@/lib/auth/permissions";
import { staffHome } from "./home";

/**
 * Visão geral da Alliance (A1, D-ALLIANCE): um cartão por marca da pessoa, com o que pede atenção (o mesmo do Início
 * de cada marca), vendas do mês pelo cupom e se a loja está conectada. Só números, nada pessoal.
 */
export async function allianceOverview(prisma: PrismaClient, actor: Actor, brands: { id: string; slug: string; name: string; primaryColor: string; secondaryColor: string | null }[], now = new Date()) {
  return Promise.all(
    brands.map(async (b) => {
      const [home, store, brand] = await Promise.all([
        staffHome(prisma, { ...actor, grants: scopeGrants(actor.grants, b.id) }),
        prisma.brandIntegration.findFirst({ where: { brandId: b.id, kind: "SHOPIFY" }, select: { status: true, externalId: true, lastSyncAt: true } }),
        prisma.brand.findUniqueOrThrow({ where: { id: b.id }, select: { timezone: true } }),
      ]);
      const month = monthKey(now, brand.timezone);
      const sales = await prisma.orderAttribution.findMany({
        where: { brandId: b.id, order: { paidAt: { gte: new Date(now.getTime() - 32 * 86_400_000) }, financialStatus: { in: ["PAID", "PARTIALLY_REFUNDED"] }, cancelledAt: null, test: false } },
        select: { order: { select: { paidAt: true, subtotalCents: true } } },
      });
      const monthSales = sales.filter((s) => s.order.paidAt && monthKey(s.order.paidAt, brand.timezone) === month);
      return {
        ...b,
        home,
        store: store ? { connected: store.status === "CONNECTED", shop: store.externalId, lastSyncAt: store.lastSyncAt } : null,
        salesCents: monthSales.reduce((acc, s) => acc + Math.max(0, s.order.subtotalCents), 0),
        orders: monthSales.length,
      };
    }),
  );
}
