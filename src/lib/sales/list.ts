import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { dayKey, isDayKey, nextDayKey, PAID_FINANCIAL, REFUNDED_FINANCIAL, saleReason, saleStatus, startOfLocalDay, type SaleStatus } from "@/domain";

/**
 * Vendas da marca para a equipe (M0.1): todos os pedidos que chegaram da Shopify, com a situação, a creator que levou
 * (ou o motivo de não ter levado) e a comissão já lançada no extrato. Só leitura; quem chama confere `money.view`.
 */

export const SALES_PAGE_SIZE = 10;

export type SalesFilters = { q?: string; status?: SaleStatus | ""; owner?: "creator" | "none" | ""; from?: string; to?: string };

const paid = [...PAID_FINANCIAL];
const refunded = [...REFUNDED_FINANCIAL];

/** Pedidos de cada situação (a mesma régua de `saleStatus`). */
function statusWhere(s: SaleStatus): Prisma.OrderWhereInput {
  if (s === "TEST") return { test: true };
  if (s === "CANCELLED") return { test: false, cancelledAt: { not: null } };
  if (s === "PAID") return { test: false, cancelledAt: null, financialStatus: { in: paid } };
  if (s === "REFUNDED") return { test: false, cancelledAt: null, financialStatus: { in: refunded } };
  return { test: false, cancelledAt: null, financialStatus: { notIn: [...paid, ...refunded] } };
}

/** Filtros da tela, sem a situação (as contagens por situação usam o resto dos filtros). */
function baseWhere(brandId: string, f: SalesFilters, timeZone: string): Prisma.OrderWhereInput {
  const and: Prisma.OrderWhereInput[] = [{ brandId }];
  const q = (f.q ?? "").trim().replace(/^#/, "");
  if (q) {
    and.push({
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        // O código vem da Shopify como a cliente digitou: procura do jeito digitado, em maiúsculas e em minúsculas.
        { discountCodes: { hasSome: [...new Set([q, q.toUpperCase(), q.toLowerCase()])] } },
        { attribution: { creator: { account: { name: { contains: q, mode: "insensitive" } } } } },
        { attribution: { coupon: { code: { contains: q.toUpperCase() } } } },
      ],
    });
  }
  if (f.owner === "creator") and.push({ attribution: { isNot: null } });
  if (f.owner === "none") and.push({ attribution: { is: null } });
  if (f.from && isDayKey(f.from)) and.push({ createdAtShop: { gte: startOfLocalDay(f.from, timeZone) } });
  if (f.to && isDayKey(f.to)) and.push({ createdAtShop: { lt: startOfLocalDay(nextDayKey(f.to), timeZone) } });
  return { AND: and };
}

const SELECT = {
  id: true,
  name: true,
  createdAtShop: true,
  paidAt: true,
  financialStatus: true,
  cancelledAt: true,
  test: true,
  subtotalCents: true,
  totalCents: true,
  discountCodes: true,
  attribution: { select: { creatorId: true, rateBps: true, coupon: { select: { code: true } }, creator: { select: { account: { select: { name: true } } } } } },
} satisfies Prisma.OrderSelect;

type OrderRow = Prisma.OrderGetPayload<{ select: typeof SELECT }>;

async function decorate(prisma: PrismaClient, brandId: string, orders: OrderRow[]) {
  const codes = [...new Set(orders.flatMap((o) => o.discountCodes.map((c) => c.toUpperCase())))];
  const [coupons, ledger] = await Promise.all([
    codes.length ? prisma.coupon.findMany({ where: { brandId, code: { in: codes } }, select: { code: true, kind: true } }) : [],
    orders.length
      ? prisma.ledgerEntry.groupBy({ by: ["orderId"], where: { brandId, orderId: { in: orders.map((o) => o.id) }, type: { in: ["COMMISSION", "REVERSAL"] } }, _sum: { amountCents: true } })
      : [],
  ]);
  const kindOf = new Map(coupons.map((c) => [c.code, c.kind]));
  const commission = new Map(ledger.map((l) => [l.orderId, l._sum.amountCents ?? 0]));
  return orders.map((o) => {
    const upper = o.discountCodes.map((c) => c.toUpperCase());
    return {
      id: o.id,
      name: o.name,
      createdAt: o.createdAtShop,
      paidAt: o.paidAt,
      status: saleStatus(o),
      subtotalCents: o.subtotalCents,
      totalCents: o.totalCents,
      codes: upper,
      creatorId: o.attribution?.creatorId ?? null,
      creatorName: o.attribution?.creator.account.name ?? null,
      rateBps: o.attribution?.rateBps ?? null,
      reason: saleReason({
        creatorCoupon: o.attribution?.coupon.code ?? null,
        codes: upper,
        coupons: upper.map((c) => (kindOf.has(c) ? { code: c, kind: kindOf.get(c) ?? null } : null)),
      }),
      commissionCents: o.attribution ? (commission.get(o.id) ?? 0) : null,
    };
  });
}

export type SaleRow = Awaited<ReturnType<typeof decorate>>[number];

/** Uma página de vendas (mais novas primeiro), as contagens por situação e as somas do filtro. */
export async function listSales(prisma: PrismaClient, brandId: string, f: SalesFilters, page = 1) {
  const brand = await prisma.brand.findUniqueOrThrow({ where: { id: brandId }, select: { timezone: true } });
  const base = baseWhere(brandId, f, brand.timezone);
  const where: Prisma.OrderWhereInput = f.status ? { AND: [base, statusWhere(f.status)] } : base;
  const statuses: SaleStatus[] = ["PAID", "PENDING", "REFUNDED", "CANCELLED", "TEST"];
  const [orders, total, sums, counts] = await Promise.all([
    prisma.order.findMany({ where, orderBy: [{ createdAtShop: "desc" }, { id: "desc" }], skip: (Math.max(1, page) - 1) * SALES_PAGE_SIZE, take: SALES_PAGE_SIZE, select: SELECT }),
    prisma.order.count({ where }),
    prisma.order.aggregate({ where, _sum: { subtotalCents: true } }),
    Promise.all(statuses.map((s) => prisma.order.count({ where: { AND: [base, statusWhere(s)] } }))),
  ]);
  return {
    rows: await decorate(prisma, brandId, orders),
    total,
    subtotalCents: sums._sum.subtotalCents ?? 0,
    counts: Object.fromEntries(statuses.map((s, i) => [s, counts[i]!])) as Record<SaleStatus, number>,
    timezone: brand.timezone,
  };
}

/** Todas as vendas do filtro para o CSV (até `limit`, mais novas primeiro). */
export async function salesForCsv(prisma: PrismaClient, brandId: string, f: SalesFilters, limit = 20_000) {
  const brand = await prisma.brand.findUniqueOrThrow({ where: { id: brandId }, select: { timezone: true } });
  const base = baseWhere(brandId, f, brand.timezone);
  const orders = await prisma.order.findMany({
    where: f.status ? { AND: [base, statusWhere(f.status)] } : base,
    orderBy: [{ createdAtShop: "desc" }, { id: "desc" }],
    take: limit,
    select: SELECT,
  });
  const rows = await decorate(prisma, brandId, orders);
  const when = (d: Date) => `${dayKey(d, brand.timezone).split("-").reverse().join("/")} ${d.toLocaleTimeString("pt-BR", { timeZone: brand.timezone, hour: "2-digit", minute: "2-digit" })}`;
  return rows.map((r) => ({
    date: when(r.createdAt),
    order: r.name,
    status: r.status,
    subtotalCents: r.subtotalCents,
    totalCents: r.totalCents,
    codes: r.codes,
    creator: r.creatorName,
    reason: r.reason,
    commissionCents: r.commissionCents,
  }));
}
