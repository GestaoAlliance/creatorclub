import type { PrismaClient } from "@/generated/prisma/client";
import type { SalesDay } from "@/lib/portal/sales";
import { change, staffDashboard, type DashPeriod } from "./dashboard";

/**
 * "Todas as marcas" (M0.0.4, D-ALLBRANDS): o Início da Alliance soma o dashboard de cada marca em que a pessoa vê
 * dinheiro — vendas de creators, comissão, creators que venderam, loja inteira —, junta o gráfico por dia e as top
 * creators (com a marca de cada uma) e compara as marcas lado a lado. Só leitura; quem chama escolhe as marcas.
 */

export type AllianceBrand = { id: string; slug: string; name: string; primaryColor: string; secondaryColor: string | null };

export async function allianceDashboard(prisma: PrismaClient, brands: readonly AllianceBrand[], period: DashPeriod, now = new Date()) {
  const per = await Promise.all(brands.map(async (brand) => ({ brand, d: await staffDashboard(prisma, brand.id, period, "", now) })));
  const total = (f: (d: (typeof per)[number]["d"]) => number) => per.reduce((s, x) => s + f(x.d), 0);

  const salesCents = total((d) => d.kpis.sales.cents);
  const commissionCents = total((d) => d.kpis.commission.cents);
  const storeCents = total((d) => d.store.salesCents);
  const sold = total((d) => d.kpis.creators.sold);
  const orders = total((d) => d.kpis.sales.orders);

  // Vendas por dia: mesmo período em todas as marcas, então os dias batem; soma dia a dia.
  const byDay = new Map<string, SalesDay>();
  for (const { d } of per)
    for (const day of d.days) {
      const acc = byDay.get(day.day) ?? { day: day.day, count: 0, baseCents: 0, commissionCents: 0 };
      acc.count += day.count;
      acc.baseCents += day.baseCents;
      acc.commissionCents += day.commissionCents;
      byDay.set(day.day, acc);
    }

  const topCreators = per
    .flatMap(({ brand, d }) => d.topCreators.map((c) => ({ ...c, brandName: brand.name, brandSlug: brand.slug, brandColor: brand.primaryColor })))
    .sort((a, b) => b.salesCents - a.salesCents)
    .slice(0, 10)
    .map((c) => ({ ...c, share: salesCents ? c.salesCents / salesCents : 0 }));
  const sorted = per.flatMap(({ d }) => d.topCreators.map((c) => c.salesCents)).sort((a, b) => b - a);

  return {
    period,
    previous: per[0]?.d.previous ?? period,
    kpis: {
      sales: { cents: salesCents, change: change(salesCents, total((d) => d.prev.salesCents)), orders, storeShare: storeCents ? salesCents / storeCents : 0 },
      commission: { cents: commissionCents, change: change(commissionCents, total((d) => d.prev.commissionCents)), rate: salesCents ? commissionCents / salesCents : 0 },
      creators: { sold, change: change(sold, total((d) => d.prev.sellers)), active: total((d) => d.kpis.creators.active) },
      store: { cents: storeCents, change: change(storeCents, total((d) => d.prev.storeSalesCents)), paidOrders: total((d) => d.store.paidOrders) },
    },
    days: [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day)),
    topCreators,
    concentration: {
      top1: salesCents ? (sorted[0] ?? 0) / salesCents : 0,
      top3: salesCents ? sorted.slice(0, 3).reduce((s, v) => s + v, 0) / salesCents : 0,
    },
    // Comparação entre as marcas (M3.1): quem vende mais com creators, o peso na loja e a comissão.
    brands: per
      .map(({ brand, d }) => ({
        ...brand,
        salesCents: d.kpis.sales.cents,
        change: d.kpis.sales.change,
        orders: d.kpis.sales.orders,
        storeShare: d.kpis.sales.storeShare,
        commissionCents: d.kpis.commission.cents,
        sold: d.kpis.creators.sold,
        active: d.kpis.creators.active,
      }))
      .sort((a, b) => b.salesCents - a.salesCents),
  };
}

export type AllianceDashboard = Awaited<ReturnType<typeof allianceDashboard>>;
