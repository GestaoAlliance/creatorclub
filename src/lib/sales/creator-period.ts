import type { PrismaClient } from "@/generated/prisma/client";
import { nextDayKey, PAID_FINANCIAL, startOfLocalDay } from "@/domain";

/**
 * D-PERIODPICK: vendas de uma creator no período (Vendas filtrada por ela e a ficha). Conta como a comissão:
 * pedidos pagos (ou parcialmente estornados), não cancelados, não teste, pela data do pagamento (D-MONTH).
 * Comissão = comissões menos estornos lançados nesses pedidos.
 */
export async function creatorPeriodSales(prisma: PrismaClient, creatorId: string, period: { from: string; to: string }, timeZone: string) {
  const paidAt = { gte: startOfLocalDay(period.from, timeZone), lt: startOfLocalDay(nextDayKey(period.to), timeZone) };
  const where = { attribution: { creatorId }, cancelledAt: null, test: false, financialStatus: { in: [...PAID_FINANCIAL] }, paidAt };
  const [agg, commission] = await Promise.all([
    prisma.order.aggregate({ where, _sum: { subtotalCents: true }, _count: true }),
    prisma.ledgerEntry.aggregate({ where: { creatorId, type: { in: ["COMMISSION", "REVERSAL"] }, order: where }, _sum: { amountCents: true } }),
  ]);
  const salesCents = agg._sum.subtotalCents ?? 0;
  return {
    salesCents,
    orders: agg._count,
    ticketCents: agg._count ? Math.round(salesCents / agg._count) : 0,
    commissionCents: commission._sum.amountCents ?? 0,
  };
}
