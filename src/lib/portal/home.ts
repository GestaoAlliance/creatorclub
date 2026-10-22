import type { PrismaClient } from "@/generated/prisma/client";
import { monthKey, PAID_FINANCIAL, REFUNDED_FINANCIAL, type Balance } from "@/domain";
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
  /** M0.4: vendas com o cupom dela feitas nos últimos 30 dias e ainda não pagas (Pix, boleto). Fora do saldo e do extrato. */
  pending: { orders: number; salesCents: number };
  /** M0.4: o que já saiu do saldo — saques pagos (soma do extrato). */
  usedCents: number;
  /** M0.4: as condições dela hoje — comissão vigente e desconto do cupom (null = sem cadastro). */
  terms: { rateBps: number | null; discountBps: number | null };
  /** Quando a participação foi encerrada (aviso com a data). */
  deactivatedAt: Date | null;
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

  const [ledger, release, attributed, assignments, pending, policy, me] = await Promise.all([
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
          select: { coupon: { select: { code: true, kind: true, discountBps: true } } },
          orderBy: { validFrom: "asc" },
        }),
    // Aguardando pagamento: pedido com o cupom dela, não cancelado, não teste, sem pagamento ainda (Pix/boleto vencido
    // vira cancelado ou expirado na Shopify e sai daqui). Só os últimos 30 dias, para não arrastar pedido esquecido.
    prisma.order.aggregate({
      where: {
        brandId: ctx.brand.id,
        attribution: { creatorId: ctx.creatorId },
        cancelledAt: null,
        test: false,
        financialStatus: { notIn: [...PAID_FINANCIAL, ...REFUNDED_FINANCIAL] },
        createdAtShop: { gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) },
      },
      _sum: { subtotalCents: true },
      _count: true,
    }),
    prisma.commissionPolicy.findFirst({
      where: { creatorId: ctx.creatorId, validFrom: { lte: now }, OR: [{ validTo: null }, { validTo: { gt: now } }] },
      orderBy: { validFrom: "desc" },
      select: { rateBps: true },
    }),
    prisma.creator.findUniqueOrThrow({ where: { id: ctx.creatorId }, select: { deactivatedAt: true } }),
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
    pending: { orders: pending._count, salesCents: pending._sum.subtotalCents ?? 0 },
    usedCents: ledger.lines.filter((l) => l.type === "WITHDRAWAL").reduce((sum, l) => sum - l.amountCents, 0),
    terms: {
      rateBps: policy?.rateBps ?? null,
      discountBps: assignments.find((a) => a.coupon.kind === "CREATOR")?.coupon.discountBps ?? null,
    },
    deactivatedAt: me.deactivatedAt,
  };
}
