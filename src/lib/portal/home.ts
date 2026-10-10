import type { PrismaClient } from "@/generated/prisma/client";
import { monthKey, type Balance } from "@/domain";
import { releaseProgress, type ReleaseProgress } from "@/lib/commission/release";
import { readLedger, type StatementLine } from "@/lib/commission/statement";
import type { PortalContext } from "./context";

/**
 * Início do portal (E7.2): saldo (disponível, a liberar e quando libera o próximo valor), vendas e comissão do mês
 * corrente pelo mês do pagamento (D-MONTH), últimos lançamentos e cupons em uso. Só dados do `ctx.creatorId`.
 */

export type PortalSummary = {
  balance: Balance;
  /** Liberação mensal (D-CONTRACT): vendas acumuladas, mínimo e próximo fechamento. */
  release: ReleaseProgress;
  month: string;
  /** Pedidos pagos atribuídos à creator no mês (não cancelados, não teste) e a soma da base. */
  salesCount: number;
  salesCents: number;
  /** Comissão líquida (comissões − estornos) dos pedidos pagos no mês. */
  commissionCents: number;
  recent: StatementLine[];
  coupons: string[];
};

const RECENT = 8;
const PAID = ["PAID", "PARTIALLY_REFUNDED"];

export async function portalSummary(prisma: PrismaClient, ctx: PortalContext, now = new Date()): Promise<PortalSummary> {
  const brand = await prisma.brand.findUniqueOrThrow({ where: { id: ctx.brand.id }, select: { timezone: true } });
  const tz = brand.timezone;
  const month = monthKey(now, tz);
  const creator = { id: ctx.creatorId, brandId: ctx.brand.id, brand: { timezone: tz } };
  // Janela folgada para trás; o mês exato é conferido no fuso da marca.
  const since = new Date(now.getTime() - 40 * 24 * 60 * 60 * 1000);

  const [ledger, release, attributed, assignments] = await Promise.all([
    readLedger(prisma, creator, now),
    releaseProgress(prisma, ctx.creatorId, now),
    prisma.orderAttribution.findMany({
      where: {
        creatorId: ctx.creatorId,
        brandId: ctx.brand.id,
        order: { paidAt: { gte: since }, financialStatus: { in: PAID }, cancelledAt: null, test: false },
      },
      select: { order: { select: { paidAt: true, subtotalCents: true } } },
    }),
    ctx.status === "DEACTIVATED"
      ? Promise.resolve([])
      : prisma.couponAssignment.findMany({
          where: { creatorId: ctx.creatorId, brandId: ctx.brand.id, validFrom: { lte: now }, OR: [{ validTo: null }, { validTo: { gt: now } }] },
          select: { coupon: { select: { code: true } } },
          orderBy: { validFrom: "asc" },
        }),
  ]);

  const sales = attributed.filter((a) => a.order.paidAt && monthKey(a.order.paidAt, tz) === month);
  return {
    balance: ledger.balance,
    release,
    month,
    salesCount: sales.length,
    salesCents: sales.reduce((sum, a) => sum + a.order.subtotalCents, 0),
    commissionCents: ledger.lines
      .filter((l) => l.month === month && (l.type === "COMMISSION" || l.type === "REVERSAL"))
      .reduce((sum, l) => sum + l.amountCents, 0),
    recent: ledger.lines.slice(0, RECENT).map(({ month: _m, ...l }) => l),
    coupons: assignments.map((a) => a.coupon.code),
  };
}
