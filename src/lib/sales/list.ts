import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { productImages } from "@/lib/reports/product-images";
import { dayKey, isDayKey, nextDayKey, PAID_FINANCIAL, REFUNDED_FINANCIAL, saleReason, saleReasonKind, saleStatus, startOfLocalDay, type SaleReasonKind, type SaleStatus } from "@/domain";

/**
 * Vendas da marca para a equipe (M0.1): todos os pedidos que chegaram da Shopify, com a situação, a creator que levou
 * (ou o motivo de não ter levado) e a comissão já lançada no extrato. Só leitura; quem chama confere `money.view`.
 */

export const SALES_PAGE_SIZE = 10;

export type SalesFilters = { q?: string; status?: SaleStatus | ""; owner?: "creator" | "none" | ""; from?: string; to?: string; /** D-SALESREVIEW: só estes pedidos (quadro da conferência). */ ids?: string[] };

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
  if (f.ids) and.push({ id: { in: f.ids } });
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

export type ReviewKey = Exclude<SaleReasonKind, "creator"> | "big";
type Bucket = { n: number; cents: number; ids: string[] };
const bucket = (): Bucket => ({ n: 0, cents: 0, ids: [] });
export const BIG_ORDER_FACTOR = 3;

/**
 * Conferência das vendas (D-SALESREVIEW, pedido do responsável em 2026-11-11): no período, pedidos com e sem creator,
 * o motivo de cada pedido sem creator (sem cupom, cupom sem tipo, cupom de creator sem dona na data, PROMO, fora do
 * sistema), aguardando pagamento, estornadas/canceladas (com a comissão devolvida), pedidos grandes (pagos com 3× o
 * ticket médio ou mais), os códigos fora do sistema agrupados e o mapa de dia × hora das vendas com creator.
 * Teste não conta; cancelada não entra nos motivos.
 */
export async function salesReview(prisma: PrismaClient, brandId: string, f: SalesFilters) {
  const brand = await prisma.brand.findUniqueOrThrow({ where: { id: brandId }, select: { timezone: true } });
  const tz = brand.timezone;
  const orders = await prisma.order.findMany({
    where: { AND: [baseWhere(brandId, { ...f, owner: "", status: "" }, tz), { test: false }] },
    select: { id: true, discountCodes: true, subtotalCents: true, createdAtShop: true, paidAt: true, financialStatus: true, cancelledAt: true, test: true, attribution: { select: { creatorId: true, coupon: { select: { code: true } } } } },
  });
  const codes = [...new Set(orders.flatMap((o) => o.discountCodes.map((c) => c.toUpperCase())))];
  const coupons = codes.length ? await prisma.coupon.findMany({ where: { brandId, code: { in: codes } }, select: { code: true, kind: true } }) : [];
  const kindOf = new Map(coupons.map((c) => [c.code, c.kind]));
  const kinds: Record<ReviewKey, Bucket> = { nocode: bucket(), untyped: bucket(), noowner: bucket(), promo: bucket(), unknown: bucket(), big: bucket() };
  const all = bucket();
  const withCreator = bucket();
  const pending = bucket();
  const lost = bucket();
  const unknownCodes = new Map<string, { orders: number; cents: number }>();
  const heat = Array.from({ length: 7 }, () => Array<number>(24).fill(0));
  const paidRows: { id: string; cents: number }[] = [];
  const add = (b: Bucket, o: { id: string; subtotalCents: number }) => { b.n++; b.cents += o.subtotalCents; b.ids.push(o.id); };
  for (const o of orders) {
    const st = saleStatus(o);
    add(all, o);
    if (st === "CANCELLED" || st === "REFUNDED") { add(lost, o); continue; }
    if (st === "PENDING") add(pending, o);
    if (st === "PAID") paidRows.push({ id: o.id, cents: o.subtotalCents });
    const upper = o.discountCodes.map((c) => c.toUpperCase());
    const k = saleReasonKind({ creatorCoupon: o.attribution?.coupon.code ?? null, codes: upper, coupons: upper.map((c) => (kindOf.has(c) ? { code: c, kind: kindOf.get(c) ?? null } : null)) });
    if (k === "creator") {
      add(withCreator, o);
      if (st === "PAID" && o.paidAt) {
        const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", hour: "2-digit", hourCycle: "h23" }).formatToParts(o.paidAt);
        const wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.find((p) => p.type === "weekday")!.value);
        const h = Number(parts.find((p) => p.type === "hour")!.value);
        heat[wd]![h]!++;
      }
      continue;
    }
    add(kinds[k], o);
    if (k === "unknown") for (const c of upper) if (!kindOf.has(c)) {
      const g = unknownCodes.get(c) ?? { orders: 0, cents: 0 };
      g.orders++;
      g.cents += o.subtotalCents;
      unknownCodes.set(c, g);
    }
  }
  const avg = paidRows.length ? paidRows.reduce((s2, r) => s2 + r.cents, 0) / paidRows.length : 0;
  for (const r of paidRows) if (avg > 0 && r.cents >= avg * BIG_ORDER_FACTOR) add(kinds.big, { id: r.id, subtotalCents: r.cents });
  const reversed = lost.ids.length ? await prisma.ledgerEntry.aggregate({ where: { brandId, orderId: { in: lost.ids }, type: "REVERSAL" }, _sum: { amountCents: true } }) : null;
  return {
    all: { n: all.n, cents: all.cents },
    withCreator: { n: withCreator.n, cents: withCreator.cents },
    pending: { n: pending.n, cents: pending.cents, ids: pending.ids },
    lost: { n: lost.n, cents: lost.cents, ids: lost.ids, reversedCents: Math.abs(reversed?._sum.amountCents ?? 0) },
    kinds,
    avgTicketCents: Math.round(avg),
    unknownCodes: [...unknownCodes].map(([code, g]) => ({ code, ...g })).sort((a, b) => b.cents - a.cents),
    heat,
  };
}

/** D-SALESREVIEW: o pedido no painel lateral (produtos, cupons, motivo, taxa, comissão e datas). */
export async function orderDetail(prisma: PrismaClient, brandId: string, orderId: string) {
  const o = await prisma.order.findFirst({
    where: { id: orderId, brandId },
    select: {
      ...SELECT,
      shopifyId: true,
      lines: { select: { title: true, quantity: true, discountedTotalCents: true, productShopifyId: true } },
      attribution: { select: { creatorId: true, rateBps: true, rule: true, evidenceCodes: true, decidedAt: true, coupon: { select: { code: true } }, creator: { select: { account: { select: { name: true } } } } } },
    },
  });
  if (!o) return null;
  const [row] = await decorate(prisma, brandId, [o]);
  const [ledger, shop] = await Promise.all([
    prisma.ledgerEntry.findMany({ where: { brandId, orderId }, orderBy: { createdAt: "asc" }, select: { type: true, amountCents: true, createdAt: true, note: true } }),
    prisma.brandIntegration.findFirst({ where: { brandId, kind: "SHOPIFY" }, select: { externalId: true } }),
  ]);
  const numeric = o.shopifyId.split("/").pop();
  const imageOf = await productImages(prisma, brandId);
  return {
    ...row!,
    cancelledAt: o.cancelledAt,
    lines: o.lines.map((l) => ({ title: l.title, quantity: l.quantity, discountedTotalCents: l.discountedTotalCents, image: imageOf(l.title, l.productShopifyId) })),
    evidence: o.attribution?.evidenceCodes ?? [],
    decidedAt: o.attribution?.decidedAt ?? null,
    ledger,
    shopifyUrl: shop?.externalId && numeric ? `https://${shop.externalId}/admin/orders/${numeric}` : null,
  };
}
