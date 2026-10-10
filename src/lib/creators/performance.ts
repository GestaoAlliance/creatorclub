import type { PrismaClient } from "@/generated/prisma/client";
import {
  accumulatedSales,
  changeBps,
  isUgcOnly,
  kitProgress,
  lastMonths,
  monthKey,
  parseKitTiers,
  previousMonthKey,
  releaseMinFor,
  sortPerformance,
  type PerformanceSort,
} from "@/domain";
import type { Actor } from "@/lib/auth/actor";
import { can } from "@/lib/auth/permissions";
import { releasedThroughFor } from "@/lib/commission/release";
import { IDLE_SELECT, idleFor } from "./idle";
import { ugcCyclesFor } from "./ugc";

/**
 * Painel do mês (U4, D-PERFORMANCE), só Gestão e super admin (`creators.edit`): por creator ativa, vendas e pedidos do
 * mês (pela data do pagamento, D-MONTH), comparação com o mês anterior, quanto falta para o mínimo do contrato (hoje),
 * a faixa do kit e quem está sem vender. UGC (permuta) fica numa lista própria, com os vídeos do ciclo.
 */

export class PerformanceError extends Error {}

const PAID = ["PAID", "PARTIALLY_REFUNDED"];

export async function monthPerformance(
  prisma: PrismaClient,
  actor: Actor | null,
  brandId: string,
  opts: { month?: string | undefined; sort?: PerformanceSort } = {},
  now = new Date(),
) {
  if (!actor || !can(actor.grants, "creators.edit", brandId)) throw new PerformanceError("Sem permissão.");
  const brand = await prisma.brand.findUniqueOrThrow({ where: { id: brandId }, select: { timezone: true, releaseMinCents: true, releaseMinPrescriberCents: true } });
  const tz = brand.timezone;
  const current = monthKey(now, tz);
  const months = lastMonths(current, 12);
  const month = opts.month && months.includes(opts.month) ? opts.month : current;
  const prev = previousMonthKey(month);

  const creators = await prisma.creator.findMany({
    where: { brandId, status: "ACTIVE" },
    select: {
      ...IDLE_SELECT,
      categories: true,
      contractEnd: true,
      ugcVideoGoal: true,
      account: { select: { name: true } },
      contractTemplate: { select: { releaseMinCents: true, kitTiers: true } },
    },
  });
  const ids = creators.map((c) => c.id);
  const [attributions, released, idle, cycles] = await Promise.all([
    prisma.orderAttribution.findMany({
      where: { creatorId: { in: ids }, order: { paidAt: { not: null }, financialStatus: { in: PAID }, cancelledAt: null, test: false } },
      select: { creatorId: true, order: { select: { paidAt: true, subtotalCents: true } } },
    }),
    releasedThroughFor(prisma, ids),
    idleFor(prisma, creators, tz, now),
    ugcCyclesFor(prisma, creators, tz, now),
  ]);

  // Vendas e pedidos por creator e mês.
  const sales = new Map<string, Map<string, { cents: number; orders: number }>>(ids.map((id) => [id, new Map()]));
  for (const a of attributions) {
    const m = monthKey(a.order.paidAt!, tz);
    const by = sales.get(a.creatorId)!;
    const cur = by.get(m) ?? { cents: 0, orders: 0 };
    by.set(m, { cents: cur.cents + Math.max(0, a.order.subtotalCents), orders: cur.orders + 1 });
  }
  const of = (id: string, m: string) => sales.get(id)!.get(m) ?? { cents: 0, orders: 0 };

  const rows = creators.map((c) => {
    const by = sales.get(c.id)!;
    const s = of(c.id, month);
    const p = of(c.id, prev);
    const minCents = releaseMinFor(c.categories, brand, c.contractTemplate);
    const centsByMonth = new Map([...by].map(([k, v]) => [k, v.cents]));
    const tiers = parseKitTiers(c.contractTemplate?.kitTiers);
    const st = idle.get(c.id);
    return {
      id: c.id,
      name: c.account.name,
      categories: c.categories,
      ugcOnly: isUgcOnly(c.categories),
      salesCents: s.cents,
      orders: s.orders,
      prevSalesCents: p.cents,
      changeBps: changeBps(s.cents, p.cents),
      // Mínimo do contrato: o que já acumulou desde a última liberação, até hoje (D-CONTRACT).
      release: minCents === null ? null : { accumulatedCents: accumulatedSales(centsByMonth, released.get(c.id) ?? null, current), minCents },
      kit: tiers.length ? kitProgress(tiers, s.cents) : null,
      idle: st?.idle ? { days: st.days, neverSold: !st.lastSaleDay } : null,
      cycle: cycles.get(c.id) ?? null,
    };
  });

  const partners = sortPerformance(rows.filter((r) => !r.ugcOnly), opts.sort ?? "vendas");
  const ugc = sortPerformance(rows.filter((r) => r.ugcOnly), "vendas");
  const total = (m: string) => rows.reduce((acc, r) => acc + of(r.id, m).cents, 0);
  return {
    month,
    current,
    months,
    summary: {
      salesCents: total(month),
      prevSalesCents: total(prev),
      changeBps: changeBps(total(month), total(prev)),
      orders: rows.reduce((acc, r) => acc + r.orders, 0),
      active: partners.length,
      sellers: partners.filter((r) => r.orders > 0).length,
      reachedMin: partners.filter((r) => r.release && r.release.accumulatedCents >= r.release.minCents).length,
      idle: partners.filter((r) => r.idle).length,
    },
    partners,
    ugc,
  };
}
