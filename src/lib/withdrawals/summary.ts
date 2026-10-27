import type { PrismaClient } from "@/generated/prisma/client";
import { computeBalance, PAID_FINANCIAL, REFUNDED_FINANCIAL } from "@/domain";
import type { Actor } from "@/lib/auth/actor";
import { brandsWith } from "@/lib/auth/permissions";
import { ledgerEntriesWithMonth, releasedThroughFor } from "@/lib/commission/release";

/**
 * Resumo "comissão a pagar" da tela de saques (M1.1): quanto a marca deve às creators hoje, em quatro partes que somam
 * o que ainda vai sair do caixa:
 * - **sacável**: liberado e ainda não pedido (só saldo positivo; saldo negativo abate das próximas, D-NEG);
 * - **já pedido**: saques em aberto, separados em em análise (Gestão) e aprovados (Pagamento);
 * - **a liberar**: comissão lançada que espera o fechamento do mês e o mínimo do contrato (D-CONTRACT);
 * - **aguardando**: vendas com cupom ainda sem pagamento (Pix, boleto) nos últimos 30 dias — fora do extrato, por isso
 *   em valor de venda, não de comissão.
 * Só leitura; as marcas são as que a pessoa vê em saques.
 */

export type PayoutSummary = {
  availableCents: number;
  requested: { count: number; cents: number };
  approved: { count: number; cents: number };
  heldCents: number;
  awaiting: { orders: number; salesCents: number };
};

export async function payoutSummary(prisma: PrismaClient, actor: Actor, brandIds?: readonly string[], now = new Date()): Promise<PayoutSummary> {
  const allowed = brandsWith(actor.grants, "withdrawals.view");
  const scope = brandIds ? (allowed === "ALL" ? [...brandIds] : brandIds.filter((id) => allowed.includes(id))) : allowed;
  const where = scope === "ALL" ? {} : { brandId: { in: scope } };

  const [brands, open, awaiting] = await Promise.all([
    prisma.brand.findMany({ where: scope === "ALL" ? {} : { id: { in: scope } }, select: { id: true, timezone: true } }),
    prisma.withdrawal.findMany({ where: { ...where, status: { in: ["REQUESTED", "APPROVED"] } }, select: { creatorId: true, status: true, amountCents: true } }),
    prisma.order.aggregate({
      where: {
        ...where,
        attribution: { isNot: null },
        cancelledAt: null,
        test: false,
        financialStatus: { notIn: [...PAID_FINANCIAL, ...REFUNDED_FINANCIAL] },
        createdAtShop: { gte: new Date(now.getTime() - 30 * 86_400_000) },
      },
      _sum: { subtotalCents: true },
      _count: true,
    }),
  ]);

  // M5.1: compras com o saldo esperando a Gestão também reservam o saldo.
  const purchases = await prisma.shipment.findMany({ where: { ...where, status: "AWAITING_APPROVAL", balanceCents: { not: null } }, select: { creatorId: true, balanceCents: true } });
  let availableCents = 0;
  let heldCents = 0;
  for (const brand of brands) {
    const ids = (await prisma.ledgerEntry.groupBy({ by: ["creatorId"], where: { brandId: brand.id } })).map((r) => r.creatorId);
    if (ids.length === 0) continue;
    const [entries, released] = await Promise.all([ledgerEntriesWithMonth(prisma, ids, brand.timezone), releasedThroughFor(prisma, ids)]);
    const byCreator = new Map<string, typeof entries>();
    for (const e of entries) {
      const list = byCreator.get(e.creatorId);
      if (list) list.push(e);
      else byCreator.set(e.creatorId, [e]);
    }
    for (const id of ids) {
      const b = computeBalance(
        byCreator.get(id) ?? [],
        [...open.filter((w) => w.creatorId === id), ...purchases.filter((p) => p.creatorId === id).map((p) => ({ amountCents: p.balanceCents! }))],
        now,
        { releasedThrough: released.get(id) ?? null },
      );
      availableCents += Math.max(0, b.availableCents);
      heldCents += b.heldCents;
    }
  }

  const stage = (s: "REQUESTED" | "APPROVED") => {
    const list = open.filter((w) => w.status === s);
    return { count: list.length, cents: list.reduce((sum, w) => sum + w.amountCents, 0) };
  };
  return {
    availableCents,
    requested: stage("REQUESTED"),
    approved: stage("APPROVED"),
    heldCents,
    awaiting: { orders: awaiting._count, salesCents: awaiting._sum.subtotalCents ?? 0 },
  };
}
