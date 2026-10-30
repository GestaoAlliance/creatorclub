import type { PrismaClient, ReleaseBasis } from "@/generated/prisma/client";
import { notify } from "@/lib/notifications/notify";
import { notices,
  accumulatedSales,
  computeBalance,
  entryMonth,
  monthClosesAt,
  monthKey,
  planReleases,
  previousMonthKey,
  releaseMinFor,
  withdrawalDays,
  type Balance,
  type LedgerEntry,
} from "@/domain";

/**
 * Fechamento mensal (D-CONTRACT). No dia 1, para cada creator, o mês que fechou entra nas vendas acumuladas desde a
 * última liberação; atingindo o mínimo do contrato (R$ 300 em vendas desde D-MIN300; na Botanika, R$ 100 de comissão,
 * D-MIN100), grava uma
 * `CommissionRelease` e a comissão desses meses fica disponível para o saque (NF do dia 1 ao 10).
 * Vendas = subtotal atual dos pedidos elegíveis atribuídos (pagos ou parcialmente reembolsados, não cancelados, não
 * teste), pelo mês do pagamento (D-MONTH). Roda pelo worker (`/api/jobs/run`); `MonthClosing` impede refazer.
 * O kit mensal por faixa (D-KIT) saiu em 2026-10-27: o produto vem pela meta de vendas (D-GOALKIT, `grantGoalKits`).
 */

type Db = PrismaClient | Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

const PAID = ["PAID", "PARTIALLY_REFUNDED"];

/** Folga depois da meia-noite do dia 1 para chegarem os últimos pedidos do mês (reconciliação a cada 15 min). */
export const CLOSING_GRACE_MS = 60 * 60 * 1000;

/** Vendas elegíveis por creator e mês do pagamento. */
export async function salesByMonth(prisma: Db, creatorIds: string[], timeZone: string): Promise<Map<string, Map<string, number>>> {
  const out = new Map<string, Map<string, number>>(creatorIds.map((id) => [id, new Map()]));
  if (creatorIds.length === 0) return out;
  const rows = await prisma.orderAttribution.findMany({
    where: { creatorId: { in: creatorIds }, order: { paidAt: { not: null }, financialStatus: { in: PAID }, cancelledAt: null, test: false } },
    select: { creatorId: true, order: { select: { paidAt: true, subtotalCents: true } } },
  });
  for (const r of rows) {
    const m = monthKey(r.order.paidAt!, timeZone);
    const byMonth = out.get(r.creatorId)!;
    byMonth.set(m, (byMonth.get(m) ?? 0) + Math.max(0, r.order.subtotalCents));
  }
  return out;
}

/**
 * D-MIN100: o que conta para o mínimo, por creator e mês. Vendas (padrão) ou, na marca com `releaseBasis` COMMISSION
 * (Botanika), a comissão lançada no extrato (comissões menos estornos), no mês do pagamento do pedido (D-MONTH).
 */
export async function releaseAmountsByMonth(prisma: Db, creatorIds: string[], timeZone: string, basis: ReleaseBasis): Promise<Map<string, Map<string, number>>> {
  if (basis === "SALES") return salesByMonth(prisma, creatorIds, timeZone);
  const out = new Map<string, Map<string, number>>(creatorIds.map((id) => [id, new Map()]));
  if (creatorIds.length === 0) return out;
  for (const e of await ledgerEntriesWithMonth(prisma, creatorIds, timeZone)) {
    if ((e.type !== "COMMISSION" && e.type !== "REVERSAL") || !e.month) continue;
    const byMonth = out.get(e.creatorId)!;
    byMonth.set(e.month, (byMonth.get(e.month) ?? 0) + e.amountCents);
  }
  return out;
}

/** Último mês liberado de cada creator (`null` = nenhum). */
export async function releasedThroughFor(prisma: Db, creatorIds: string[]): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>(creatorIds.map((id) => [id, null]));
  if (creatorIds.length === 0) return out;
  const rows = await prisma.commissionRelease.groupBy({ by: ["creatorId"], where: { creatorId: { in: creatorIds } }, _max: { month: true } });
  for (const r of rows) out.set(r.creatorId, r._max.month);
  return out;
}

/** Lançamentos com o mês do extrato (D-MONTH), prontos para `computeBalance` com liberação mensal. */
export async function ledgerEntriesWithMonth(
  prisma: Db,
  creatorIds: string[],
  timeZone: string,
): Promise<(LedgerEntry & { creatorId: string })[]> {
  const rows = await prisma.ledgerEntry.findMany({
    where: { creatorId: { in: creatorIds } },
    select: { creatorId: true, type: true, amountCents: true, availableAt: true, createdAt: true, order: { select: { paidAt: true } } },
  });
  return rows.map((e) => ({
    creatorId: e.creatorId,
    type: e.type,
    amountCents: e.amountCents,
    availableAt: e.availableAt,
    month: entryMonth({ createdAt: e.createdAt, orderPaidAt: e.order?.paidAt ?? null }, timeZone),
  }));
}

/**
 * O que está reservado no saldo: saques pedidos e ainda não pagos, e compras com o saldo esperando a Gestão (M5.1,
 * D-SHOPBALANCE; a compra aprovada vira lançamento PURCHASE no extrato).
 */
export async function openReservations(prisma: Db, where: { creatorId: { in: string[] } } | { creatorId: string; brandId: string }): Promise<{ creatorId: string; amountCents: number }[]> {
  const [withdrawals, purchases] = await Promise.all([
    prisma.withdrawal.findMany({ where: { ...where, status: { in: ["REQUESTED", "APPROVED"] } }, select: { creatorId: true, amountCents: true } }),
    prisma.shipment.findMany({ where: { ...where, status: "AWAITING_APPROVAL", balanceCents: { not: null } }, select: { creatorId: true, balanceCents: true } }),
  ]);
  return [...withdrawals, ...purchases.map((p) => ({ creatorId: p.creatorId, amountCents: p.balanceCents! }))];
}

/** Saldo de uma creator com a liberação mensal (usado dentro da transação do pedido de saque). */
export async function creatorBalance(prisma: Db, creator: { id: string; brandId: string }, timeZone: string, now: Date): Promise<Balance> {
  const [entries, open, released] = await Promise.all([
    ledgerEntriesWithMonth(prisma, [creator.id], timeZone),
    openReservations(prisma, { creatorId: creator.id, brandId: creator.brandId }),
    releasedThroughFor(prisma, [creator.id]),
  ]);
  return computeBalance(entries, open, now, { releasedThrough: released.get(creator.id) ?? null });
}

export type ReleaseProgress = {
  releasedThrough: string | null;
  /** D-MIN100: o mínimo conta vendas ou comissão. */
  basis: ReleaseBasis;
  /** Mínimo do contrato; `null` = contrato sem comissão (UGC permuta). */
  minCents: number | null;
  /** Acumulado (vendas ou comissão) desde a última liberação, contando o mês corrente. */
  accumulatedCents: number;
  /** Próximo fechamento (dia 1 do mês seguinte). */
  nextClosingAt: Date;
};

/** Quanto falta para a próxima liberação (portal e ficha). */
export async function releaseProgress(prisma: Db, creatorId: string, now: Date): Promise<ReleaseProgress> {
  const creator = await prisma.creator.findUniqueOrThrow({
    where: { id: creatorId },
    select: {
      categories: true,
      contractTemplate: { select: { releaseMinCents: true } },
      brand: { select: { timezone: true, releaseMinCents: true, releaseMinPrescriberCents: true, releaseBasis: true } },
    },
  });
  const tz = creator.brand.timezone;
  const basis = creator.brand.releaseBasis;
  const [sales, released] = await Promise.all([releaseAmountsByMonth(prisma, [creatorId], tz, basis), releasedThroughFor(prisma, [creatorId])]);
  const releasedThrough = released.get(creatorId) ?? null;
  return {
    releasedThrough,
    basis,
    minCents: releaseMinFor(creator.categories, creator.brand, creator.contractTemplate),
    accumulatedCents: accumulatedSales(sales.get(creatorId)!, releasedThrough, monthKey(now, tz)),
    nextClosingAt: monthClosesAt(monthKey(now, tz), tz),
  };
}

/** Último mês já fechado para a marca agora (considerando a folga). */
export function lastClosedMonth(now: Date, timeZone: string): string {
  return previousMonthKey(monthKey(new Date(now.getTime() - CLOSING_GRACE_MS), timeZone));
}

/** Fecha o mês de cada marca ativa que ainda não foi fechado. Devolve quantas liberações gravou. */
export async function closeDueMonths(prisma: PrismaClient, now = new Date(), only?: { brandId: string }): Promise<number> {
  const brands = await prisma.brand.findMany({
    where: { archivedAt: null, ...(only ? { id: only.brandId } : {}) },
    select: { id: true, slug: true, timezone: true, releaseMinCents: true, releaseMinPrescriberCents: true, releaseBasis: true, withdrawalWindowStartDay: true, withdrawalWindowEndDay: true, withdrawalPayFromDay: true, withdrawalPayByDay: true },
  });
  let total = 0;
  for (const brand of brands) {
    const month = lastClosedMonth(now, brand.timezone);
    if (await prisma.monthClosing.findUnique({ where: { brandId_month: { brandId: brand.id, month } }, select: { id: true } })) continue;
    total += await closeBrandMonth(prisma, brand, month, now);
  }
  return total;
}

async function closeBrandMonth(
  prisma: PrismaClient,
  brand: { id: string; slug: string; timezone: string; releaseMinCents: number; releaseMinPrescriberCents: number; releaseBasis: ReleaseBasis; withdrawalWindowStartDay?: number; withdrawalWindowEndDay?: number; withdrawalPayFromDay?: number | null; withdrawalPayByDay?: number },
  month: string,
  now: Date,
): Promise<number> {
  return prisma.$transaction(
    async (tx) => {
      // Trava o fechamento da marca: dois workers ao mesmo tempo não gravam em dobro.
      await tx.$queryRaw`SELECT id FROM "Brand" WHERE id = ${brand.id} FOR UPDATE`;
      if (await tx.monthClosing.findUnique({ where: { brandId_month: { brandId: brand.id, month } }, select: { id: true } })) return 0;
      const creators = await tx.creator.findMany({
        where: { brandId: brand.id },
        select: { id: true, categories: true, contractTemplate: { select: { releaseMinCents: true } } },
      });
      const ids = creators.map((c) => c.id);
      const [sales, released] = await Promise.all([releaseAmountsByMonth(tx, ids, brand.timezone, brand.releaseBasis), releasedThroughFor(tx, ids)]);
      const rows = creators.flatMap((c) => {
        const minCents = releaseMinFor(c.categories, brand, c.contractTemplate);
        if (minCents === null) return []; // contrato sem comissão (UGC permuta)
        return planReleases({ salesByMonth: sales.get(c.id)!, releasedThrough: released.get(c.id) ?? null, lastClosedMonth: month, minCents }).map(
          (r) => ({ brandId: brand.id, creatorId: c.id, month: r.month, salesCents: r.salesCents, minCents, basis: brand.releaseBasis, releasedAt: now }),
        );
      });
      if (rows.length) await tx.commissionRelease.createMany({ data: rows });
      // D-GOALKIT (2026-10-27): o kit mensal por faixa saiu; o produto vem pela meta de R$ 1.000 (`grantGoalKits`).
      // U5 (D-NOTICES): avisa quem teve comissão liberada neste fechamento.
      await notify(tx, [...new Set(rows.map((r) => r.creatorId))].map((creatorId) => ({ brandId: brand.id, creatorId, notice: notices.commissionReleased(month, brand.withdrawalWindowStartDay ? withdrawalDays({ withdrawalWindowStartDay: brand.withdrawalWindowStartDay, withdrawalWindowEndDay: brand.withdrawalWindowEndDay ?? 10, withdrawalPayFromDay: brand.withdrawalPayFromDay ?? null, withdrawalPayByDay: brand.withdrawalPayByDay ?? 15 }) : undefined) })));
      const closing = await tx.monthClosing.create({ data: { brandId: brand.id, month, releases: rows.length, closedAt: now } });
      await tx.auditLog.create({
        data: {
          brandId: brand.id,
          actorType: "JOB",
          action: "month.close",
          entity: "MonthClosing",
          entityId: closing.id,
          after: { month, releases: rows.length, creators: [...new Set(rows.map((r) => r.creatorId))].length },
        },
      });
      return rows.length;
    },
    { timeout: 30_000 },
  );
}
