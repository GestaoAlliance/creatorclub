import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { dayKey } from "@/domain";
import type { Actor } from "@/lib/auth/actor";
import { can } from "@/lib/auth/permissions";
import { productImages } from "@/lib/reports/product-images";

/**
 * Resumo da ficha da creator (D-CREATORFILE, pedido do responsável em 2026-11-11): vendas por mês (12 meses), produtos
 * que ela mais vende, comparação com a média das ativas da marca, último envio e a abertura (D-OPENINGPAID). Vendas =
 * pedidos pagos atribuídos, não cancelados, não teste (mesma régua da comissão), pela data do pagamento no fuso da marca.
 * Dinheiro (vendas, produtos, comparação, abertura) só para quem vê dinheiro; o envio para quem vê creators.
 */

const DAY = 86_400_000;
export const FILE_MONTHS = 12;

export type CreatorInsights = {
  money: {
    months: { month: string; cents: number; orders: number }[];
    products: { title: string; quantity: number; cents: number; image: string | null }[];
    compare: { sales30Cents: number; averageCents: number; rank: number | null; active: number };
    opening: { approved: boolean; paidCents: number | null; note: string | null };
  } | null;
  shipment: {
    status: string;
    createdAt: Date;
    shippedAt: Date | null;
    deliveredAt: Date | null;
    deliveredBy: string | null;
    carrier: string | null;
    trackingCode: string | null;
    kit: string | null;
    items: { title: string; quantity: number }[];
    /** D-SHIPREVIEW: avaliação dela. */
    review: { rating: number; comment: string | null } | null;
  } | null;
  shipments: number;
};

/** Os últimos `n` meses ("AAAA-MM"), do mais antigo ao atual. */
export function lastMonths(now: Date, timeZone: string, n = FILE_MONTHS): string[] {
  const [y, m] = dayKey(now, timeZone).split("-").map(Number) as [number, number];
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 - (n - 1 - i), 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  });
}

const KIT_LABEL: Record<string, string> = { WELCOME: "kit de boas-vindas", MONTHLY: "kit do mês", GOAL: "kit da meta" };

export async function creatorInsights(prisma: PrismaClient, actor: Actor, creatorId: string, now = new Date()): Promise<CreatorInsights> {
  const c = await prisma.creator.findUniqueOrThrow({ where: { id: creatorId }, select: { id: true, brandId: true, withdrawalsUnlockedAt: true, brand: { select: { timezone: true } } } });
  const money = can(actor.grants, "money.view", c.brandId);
  const months = lastMonths(now, c.brand.timezone);
  const paid = { cancelledAt: null, test: false, financialStatus: { in: ["PAID" as const, "PARTIALLY_REFUNDED" as const] } };

  const [ship, shipCount, moneyPart] = await Promise.all([
    prisma.shipment.findFirst({
      where: { creatorId: c.id },
      orderBy: { createdAt: "desc" },
      select: { status: true, createdAt: true, shippedAt: true, deliveredAt: true, deliveredBy: true, carrier: true, trackingCode: true, kit: { select: { kind: true } }, items: { select: { title: true, quantity: true } }, review: { select: { rating: true, comment: true } } },
    }),
    prisma.shipment.count({ where: { creatorId: c.id, status: { not: "CANCELLED" } } }),
    money
      ? (async () => {
          const since = new Date(now.getTime() - 400 * DAY);
          const [orders, lines, ranking, opening] = await Promise.all([
            prisma.order.findMany({ where: { ...paid, attribution: { creatorId: c.id }, paidAt: { gte: since } }, select: { paidAt: true, subtotalCents: true } }),
            prisma.orderLine.groupBy({
              by: ["title"],
              where: { order: { ...paid, attribution: { creatorId: c.id }, paidAt: { gte: new Date(now.getTime() - 365 * DAY) } }, discountedTotalCents: { gt: 0 } },
              _sum: { quantity: true, discountedTotalCents: true },
              orderBy: { _sum: { quantity: "desc" } },
              take: 5,
            }),
            // Ativas da marca e as vendas de 30 dias de cada uma (quem não vendeu conta zero na média).
            prisma.$queryRaw<{ id: string; cents: bigint }[]>(Prisma.sql`
              SELECT cr.id, COALESCE(SUM(o."subtotalCents") FILTER (WHERE o."paidAt" >= ${new Date(now.getTime() - 30 * DAY)}), 0) AS cents
              FROM "Creator" cr
              LEFT JOIN "OrderAttribution" a ON a."creatorId" = cr.id
              LEFT JOIN "Order" o ON o.id = a."orderId" AND o."cancelledAt" IS NULL AND o.test = false
                AND o."financialStatus" IN ('PAID', 'PARTIALLY_REFUNDED')
              WHERE cr."brandId" = ${c.brandId} AND cr.status = 'ACTIVE' AND cr."archivedAt" IS NULL AND cr."awaitingContractAt" IS NULL
              GROUP BY cr.id`),
            prisma.openingPaid.findUnique({ where: { creatorId: c.id }, select: { paidCents: true, note: true } }),
          ]);
          const imageOf = await productImages(prisma, c.brandId);
          const byMonth = new Map(months.map((m) => [m, { cents: 0, orders: 0 }]));
          for (const o of orders) {
            const b = o.paidAt ? byMonth.get(dayKey(o.paidAt, c.brand.timezone).slice(0, 7)) : undefined;
            if (!b) continue;
            b.cents += o.subtotalCents;
            b.orders++;
          }
          const sales = ranking.map((r) => ({ id: r.id, cents: Number(r.cents) }));
          const mine = sales.find((r) => r.id === c.id);
          const sorted = [...sales].sort((x, y) => y.cents - x.cents);
          return {
            months: months.map((m) => ({ month: m, ...byMonth.get(m)! })),
            products: lines.map((l) => ({ title: l.title, quantity: l._sum.quantity ?? 0, cents: l._sum.discountedTotalCents ?? 0, image: imageOf(l.title) })),
            compare: {
              sales30Cents: mine?.cents ?? 0,
              averageCents: sales.length ? Math.round(sales.reduce((s, r) => s + r.cents, 0) / sales.length) : 0,
              rank: mine && mine.cents > 0 ? sorted.findIndex((r) => r.id === c.id) + 1 : null,
              active: sales.length,
            },
            opening: { approved: c.withdrawalsUnlockedAt !== null, paidCents: opening?.paidCents ?? null, note: opening?.note ?? null },
          };
        })()
      : Promise.resolve(null),
  ]);

  return {
    money: moneyPart,
    shipment: ship
      ? {
          status: ship.status,
          createdAt: ship.createdAt,
          shippedAt: ship.shippedAt,
          deliveredAt: ship.deliveredAt,
          deliveredBy: ship.deliveredBy,
          carrier: ship.carrier,
          trackingCode: ship.trackingCode,
          kit: ship.kit ? (KIT_LABEL[ship.kit.kind] ?? null) : null,
          items: ship.items,
          review: ship.review,
        }
      : null,
    shipments: shipCount,
  };
}
