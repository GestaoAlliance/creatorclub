import type { PrismaClient } from "@/generated/prisma/client";
import { dayKey, startOfLocalDay } from "@/domain";
import type { PortalContext } from "./context";

/**
 * Aba Cupom (E7.5): cupons em uso da creator, com o link rastreado (`/r/[marca]/[código]`, D-LINK) e os cliques
 * no link (este mês, no fuso da marca, e total). Creator Desligada não vê cupom ativo (D-PORTALACCESS).
 */

export type PortalCoupon = { code: string; path: string; clicksMonth: number; clicksTotal: number };

export async function portalCoupons(prisma: PrismaClient, ctx: PortalContext, now = new Date()): Promise<PortalCoupon[]> {
  if (ctx.status === "DEACTIVATED") return [];
  const { timezone } = await prisma.brand.findUniqueOrThrow({ where: { id: ctx.brand.id }, select: { timezone: true } });
  const monthStart = startOfLocalDay(`${dayKey(now, timezone).slice(0, 8)}01`, timezone);
  const assignments = await prisma.couponAssignment.findMany({
    where: {
      creatorId: ctx.creatorId,
      brandId: ctx.brand.id,
      validFrom: { lte: now },
      OR: [{ validTo: null }, { validTo: { gt: now } }],
      coupon: { kind: "CREATOR" },
    },
    select: { coupon: { select: { id: true, code: true } } },
    orderBy: { validFrom: "asc" },
  });
  return Promise.all(
    assignments.map(async ({ coupon }) => {
      const [clicksMonth, clicksTotal] = await Promise.all([
        prisma.click.count({ where: { couponId: coupon.id, createdAt: { gte: monthStart } } }),
        prisma.click.count({ where: { couponId: coupon.id } }),
      ]);
      return { code: coupon.code, path: `/r/${ctx.brand.slug}/${encodeURIComponent(coupon.code)}`, clicksMonth, clicksTotal };
    }),
  );
}
