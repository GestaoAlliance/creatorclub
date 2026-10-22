import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { addDaysKey, dayKey, isDayKey, nextDayKey, PAID_FINANCIAL, REFUNDED_FINANCIAL, startOfLocalDay } from "@/domain";
import type { SalesDay } from "@/lib/portal/sales";

/**
 * Dashboard do Início (M0.0.4, modelo da referência): vendas de creators no período com a comparação com o período
 * anterior, a loja inteira, vendas por dia, top creators e top produtos com cupom. A venda conta pela data do pagamento
 * (D-MONTH), só paga/parcialmente estornada, não cancelada, não teste — a mesma régua da comissão. Só leitura; quem
 * chama confere `money.view` na marca.
 */

export type DashCategory = "INFLUENCER" | "UGC" | "PRESCRITOR" | "";
export type DashPeriod = { from: string; to: string; preset: string };

export const DASH_PRESETS = [
  { id: "7", label: "7 dias" },
  { id: "30", label: "30 dias" },
  { id: "90", label: "90 dias" },
  { id: "mes", label: "Este mês" },
] as const;

/** Período do filtro (dias locais "AAAA-MM-DD", fim incluído). Padrão: últimos 30 dias até hoje. */
export function dashPeriod(p: { periodo?: string; de?: string; ate?: string }, timeZone: string, now = new Date()): DashPeriod {
  const today = dayKey(now, timeZone);
  if (p.de && p.ate && isDayKey(p.de) && isDayKey(p.ate) && p.de <= p.ate) return { from: p.de, to: p.ate, preset: "" };
  if (p.periodo === "mes") return { from: `${today.slice(0, 8)}01`, to: today, preset: "mes" };
  const days = p.periodo === "7" ? 7 : p.periodo === "90" ? 90 : 30;
  return { from: addDaysKey(today, -(days - 1)), to: today, preset: String(days) };
}

/** Período anterior de mesmo tamanho, para a comparação. */
export function previousPeriod(p: { from: string; to: string }): { from: string; to: string } {
  const len = Math.round((Date.parse(`${p.to}T12:00:00Z`) - Date.parse(`${p.from}T12:00:00Z`)) / 86_400_000) + 1;
  return { from: addDaysKey(p.from, -len), to: addDaysKey(p.from, -1) };
}

/** Variação em % (null quando não há base para comparar). */
export function change(now: number, before: number): number | null {
  if (before === 0) return now === 0 ? 0 : null;
  return Math.round(((now - before) / before) * 1000) / 10;
}

const paidOrder = (brandId: string, gte: Date, lt: Date): Prisma.OrderWhereInput => ({
  brandId,
  cancelledAt: null,
  test: false,
  financialStatus: { in: [...PAID_FINANCIAL] },
  paidAt: { gte, lt },
});

function creatorWhere(category: DashCategory): Prisma.OrderWhereInput {
  return category ? { attribution: { creator: { categories: { has: category } } } } : { attribution: { isNot: null } };
}

async function window(prisma: PrismaClient, brandId: string, p: { from: string; to: string }, category: DashCategory, tz: string) {
  const gte = startOfLocalDay(p.from, tz);
  const lt = startOfLocalDay(nextDayKey(p.to), tz);
  const base = paidOrder(brandId, gte, lt);
  const [orders, store] = await Promise.all([
    prisma.order.findMany({
      where: { ...base, ...creatorWhere(category) },
      select: { id: true, paidAt: true, subtotalCents: true, attribution: { select: { creatorId: true } } },
    }),
    prisma.order.aggregate({ where: base, _sum: { subtotalCents: true }, _count: true }),
  ]);
  const ids = orders.map((o) => o.id);
  const [ledger, units] = await Promise.all([
    ids.length
      ? prisma.ledgerEntry.findMany({ where: { brandId, orderId: { in: ids }, type: { in: ["COMMISSION", "REVERSAL"] } }, select: { orderId: true, amountCents: true } })
      : [],
    ids.length ? prisma.orderLine.aggregate({ where: { brandId, orderId: { in: ids } }, _sum: { quantity: true } }) : null,
  ]);
  return { gte, lt, orders, ledger, store: { salesCents: store._sum.subtotalCents ?? 0, orders: store._count }, units: units?._sum.quantity ?? 0 };
}

export async function staffDashboard(prisma: PrismaClient, brandId: string, period: DashPeriod, category: DashCategory, now = new Date()) {
  const brand = await prisma.brand.findUniqueOrThrow({ where: { id: brandId }, select: { timezone: true } });
  const tz = brand.timezone;
  const prev = previousPeriod(period);
  const [cur, before, activeCreators, storeByStatus] = await Promise.all([
    window(prisma, brandId, period, category, tz),
    window(prisma, brandId, prev, category, tz),
    prisma.creator.count({ where: { brandId, status: "ACTIVE", ...(category ? { categories: { has: category } } : {}) } }),
    (async () => {
      const gte = startOfLocalDay(period.from, tz);
      const lt = startOfLocalDay(nextDayKey(period.to), tz);
      const made = { brandId, test: false, createdAtShop: { gte, lt } };
      const [pending, refunded, cancelled] = await Promise.all([
        prisma.order.count({ where: { ...made, cancelledAt: null, financialStatus: { notIn: [...PAID_FINANCIAL, ...REFUNDED_FINANCIAL] } } }),
        prisma.order.count({ where: { ...made, cancelledAt: null, financialStatus: { in: [...REFUNDED_FINANCIAL] } } }),
        prisma.order.count({ where: { ...made, cancelledAt: { not: null } } }),
      ]);
      return { pending, refunded, cancelled };
    })(),
  ]);

  const sum = (w: typeof cur) => w.orders.reduce((s, o) => s + o.subtotalCents, 0);
  const commission = (w: typeof cur) => w.ledger.reduce((s, e) => s + e.amountCents, 0);
  const sellers = (w: typeof cur) => new Set(w.orders.map((o) => o.attribution!.creatorId)).size;
  const salesCents = sum(cur);

  // Vendas por dia (todos os dias do período, inclusive os sem venda).
  const commissionOf = new Map<string, number>();
  for (const e of cur.ledger) if (e.orderId) commissionOf.set(e.orderId, (commissionOf.get(e.orderId) ?? 0) + e.amountCents);
  const byDay = new Map<string, SalesDay>();
  for (let d = period.from; d <= period.to; d = nextDayKey(d)) byDay.set(d, { day: d, count: 0, baseCents: 0, commissionCents: 0 });
  for (const o of cur.orders) {
    const d = byDay.get(dayKey(o.paidAt!, tz));
    if (!d) continue;
    d.count++;
    d.baseCents += o.subtotalCents;
    d.commissionCents += commissionOf.get(o.id) ?? 0;
  }

  // Top creators do período.
  const perCreator = new Map<string, { salesCents: number; orders: number }>();
  for (const o of cur.orders) {
    const c = perCreator.get(o.attribution!.creatorId) ?? { salesCents: 0, orders: 0 };
    c.salesCents += o.subtotalCents;
    c.orders++;
    perCreator.set(o.attribution!.creatorId, c);
  }
  const topIds = [...perCreator.entries()].sort((a, b) => b[1].salesCents - a[1].salesCents).slice(0, 10);
  const people = topIds.length
    ? await prisma.creator.findMany({ where: { id: { in: topIds.map(([id]) => id) } }, select: { id: true, categories: true, account: { select: { name: true, instagram: true } } } })
    : [];
  const who = new Map(people.map((p) => [p.id, p]));
  const topCreators = topIds.map(([id, v]) => ({
    id,
    name: who.get(id)?.account.name ?? "—",
    instagram: who.get(id)?.account.instagram ?? null,
    categories: who.get(id)?.categories ?? [],
    ...v,
    share: salesCents ? v.salesCents / salesCents : 0,
  }));

  // Top produtos vendidos com cupom de creator.
  const ids = cur.orders.map((o) => o.id);
  const lines = ids.length
    ? await prisma.orderLine.groupBy({ by: ["title"], where: { brandId, orderId: { in: ids } }, _sum: { quantity: true, discountedTotalCents: true }, _count: { orderId: true } })
    : [];
  const topProducts = lines
    .map((l) => ({ title: l.title, units: l._sum.quantity ?? 0, salesCents: l._sum.discountedTotalCents ?? 0, orders: l._count.orderId }))
    .sort((a, b) => b.units - a.units || b.salesCents - a.salesCents)
    .slice(0, 10);

  // Concentração: quanto a maior e as 3 maiores fazem das vendas de creators.
  const sorted = [...perCreator.values()].map((v) => v.salesCents).sort((a, b) => b - a);
  const top1 = salesCents ? (sorted[0] ?? 0) / salesCents : 0;
  const top3 = salesCents ? sorted.slice(0, 3).reduce((s, v) => s + v, 0) / salesCents : 0;

  return {
    period,
    previous: prev,
    kpis: {
      sales: { cents: salesCents, change: change(salesCents, sum(before)), orders: cur.orders.length, storeShare: cur.store.salesCents ? salesCents / cur.store.salesCents : 0 },
      commission: { cents: commission(cur), change: change(commission(cur), commission(before)), rate: salesCents ? commission(cur) / salesCents : 0 },
      creators: { sold: sellers(cur), change: change(sellers(cur), sellers(before)), active: activeCreators },
      units: { count: cur.units, change: change(cur.units, before.units), ticketCents: cur.orders.length ? Math.round(salesCents / cur.orders.length) : 0 },
    },
    store: { salesCents: cur.store.salesCents, change: change(cur.store.salesCents, before.store.salesCents), paidOrders: cur.store.orders, ...storeByStatus },
    days: [...byDay.values()],
    topCreators,
    topProducts,
    concentration: { top1, top3 },
    generatedAt: now,
  };
}

export type StaffDashboard = Awaited<ReturnType<typeof staffDashboard>>;
