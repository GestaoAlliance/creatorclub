import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { computeBalance } from "@/domain";
import { ledgerEntriesWithMonth, openReservations, releasedThroughFor } from "@/lib/commission/release";
import type { DashCategory } from "./dashboard";

/**
 * Insights do Início (D-HOMEINSIGHTS, plano do responsável em 2026-11-11):
 * - saúde da base: em que ponto do caminho cada creator está (candidata → assinou → vendendo → parada);
 * - caixa do Pagamento: a liberar no próximo dia 1, disponível para saque, pedido e aprovado (a pagar).
 * Vendas = pedidos pagos atribuídos, não cancelados, não teste (mesma regra das comissões).
 */

const DAY = 86_400_000;
/** Vendendo = ao menos uma venda nos últimos 30 dias. */
export const SELLING_DAYS = 30;

export type BaseHealth = {
  applications: number;
  awaitingSignature: number;
  active: number;
  selling: number;
  stopped: number;
  neverSold: number;
  /** Mediana de dias entre a entrada (assinatura/ativação) e a primeira venda, de quem começou a vender nos últimos 180 dias. */
  medianDaysToFirstSale: number | null;
  /** Creators com a primeira venda dentro do período escolhido, para "Primeira venda" nos movimentos (as 6 mais recentes). */
  firstSales: { id: string; name: string; day: Date }[];
  firstSaleCount: number;
};

type SaleSpan = { creatorId: string; first: Date; last: Date };

/** Primeira e última venda de cada creator da marca. */
async function saleSpans(prisma: PrismaClient, brandId: string): Promise<SaleSpan[]> {
  return prisma.$queryRaw<SaleSpan[]>(Prisma.sql`
    SELECT a."creatorId", MIN(o."paidAt") AS first, MAX(o."paidAt") AS last
    FROM "OrderAttribution" a JOIN "Order" o ON o.id = a."orderId"
    WHERE a."brandId" = ${brandId} AND o."cancelledAt" IS NULL AND o.test = false
      AND o."financialStatus" IN ('PAID', 'PARTIALLY_REFUNDED') AND o."paidAt" IS NOT NULL
    GROUP BY a."creatorId"`);
}

export async function baseHealth(prisma: PrismaClient, brandId: string, category: DashCategory, period: { gte: Date; lt: Date }, now = new Date()): Promise<BaseHealth> {
  const cat = category ? { categories: { has: category } } : {};
  const [applications, awaitingSignature, creators, spans] = await Promise.all([
    prisma.creatorApplication.count({ where: { brandId, status: "NEW" } }),
    prisma.creator.count({ where: { brandId, status: { not: "DEACTIVATED" }, awaitingContractAt: { not: null }, ...cat } }),
    prisma.creator.findMany({
      where: { brandId, status: "ACTIVE", awaitingContractAt: null, ...cat },
      select: { id: true, activatedAt: true, contractStart: true, createdAt: true },
    }),
    saleSpans(prisma, brandId),
  ]);
  const span = new Map(spans.map((s) => [s.creatorId, s]));
  const since = new Date(now.getTime() - SELLING_DAYS * DAY);
  let selling = 0;
  let stopped = 0;
  let neverSold = 0;
  const waits: number[] = [];
  for (const c of creators) {
    const s = span.get(c.id);
    if (!s) neverSold++;
    else if (s.last >= since) selling++;
    else stopped++;
    const start = c.contractStart ?? c.activatedAt ?? c.createdAt;
    if (s && s.first >= new Date(now.getTime() - 180 * DAY) && s.first >= start) waits.push(Math.round((s.first.getTime() - start.getTime()) / DAY));
  }
  waits.sort((a, b) => a - b);
  const median = waits.length ? waits[Math.floor(waits.length / 2)]! : null;
  const activeIds = new Set(creators.map((c) => c.id));
  const first = spans.filter((x) => activeIds.has(x.creatorId) && x.first >= period.gte && x.first < period.lt).sort((a, b) => b.first.getTime() - a.first.getTime());
  const names = first.length
    ? new Map((await prisma.creator.findMany({ where: { id: { in: first.slice(0, 6).map((x) => x.creatorId) } }, select: { id: true, account: { select: { name: true } } } })).map((c) => [c.id, c.account.name]))
    : new Map<string, string>();
  return {
    applications,
    awaitingSignature,
    active: creators.length,
    selling,
    stopped,
    neverSold,
    medianDaysToFirstSale: median,
    firstSales: first.slice(0, 6).map((x) => ({ id: x.creatorId, name: names.get(x.creatorId) ?? "—", day: x.first })),
    firstSaleCount: first.length,
  };
}

export type Cashflow = {
  /** Comissão que ainda espera o fechamento do mês (dia 1). */
  heldCents: number;
  /** Já liberado e não pedido (só saldo positivo; quem está negativo abate das próximas). */
  availableCents: number;
  availableCreators: number;
  /** Saques pedidos (o Pagamento confere) e aprovados (a pagar). */
  requested: { count: number; cents: number };
  approved: { count: number; cents: number };
  /** Liberado de quem ainda não teve o saldo de abertura aprovado (não consegue pedir). */
  lockedCents: number;
};

export async function cashflow(prisma: PrismaClient, brandId: string, now = new Date()): Promise<Cashflow> {
  const brand = await prisma.brand.findUniqueOrThrow({ where: { id: brandId }, select: { timezone: true } });
  const creators = await prisma.creator.findMany({ where: { brandId, status: { not: "DEACTIVATED" } }, select: { id: true, withdrawalsUnlockedAt: true } });
  const ids = creators.map((c) => c.id);
  const [entries, open, released, requested, approved] = await Promise.all([
    ledgerEntriesWithMonth(prisma, ids, brand.timezone),
    openReservations(prisma, { creatorId: { in: ids } }),
    releasedThroughFor(prisma, ids),
    prisma.withdrawal.aggregate({ where: { brandId, status: "REQUESTED" }, _count: true, _sum: { amountCents: true } }),
    prisma.withdrawal.aggregate({ where: { brandId, status: "APPROVED" }, _count: true, _sum: { amountCents: true } }),
  ]);
  const byCreator = new Map<string, typeof entries>();
  for (const e of entries) byCreator.set(e.creatorId, [...(byCreator.get(e.creatorId) ?? []), e]);
  let heldCents = 0;
  let availableCents = 0;
  let availableCreators = 0;
  let lockedCents = 0;
  for (const c of creators) {
    const b = computeBalance(byCreator.get(c.id) ?? [], open.filter((o) => o.creatorId === c.id), now, { releasedThrough: released.get(c.id) ?? null });
    heldCents += Math.max(0, b.heldCents);
    if (b.availableCents <= 0) continue;
    if (c.withdrawalsUnlockedAt) {
      availableCents += b.availableCents;
      availableCreators++;
    } else lockedCents += b.availableCents;
  }
  return {
    heldCents,
    availableCents,
    availableCreators,
    requested: { count: requested._count, cents: requested._sum.amountCents ?? 0 },
    approved: { count: approved._count, cents: approved._sum.amountCents ?? 0 },
    lockedCents,
  };
}
