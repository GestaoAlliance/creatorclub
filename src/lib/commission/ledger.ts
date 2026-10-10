import type { PrismaClient } from "@/generated/prisma/client";
import { computeCommissionEntry, type LedgerEntryDraft } from "@/domain";
import { decideAttribution, type AttributionOutcome } from "./attribution";

/**
 * Lançamentos de comissão (E5.2). Para cada versão do pedido: devido − lançado vira um lançamento (COMMISSION se
 * positivo, REVERSAL se negativo; D-NEG: o saldo pode ficar negativo). A chave de idempotência inclui a versão.
 * Uma trava por pedido (advisory lock na transação) impede dois processos de lançar a mesma diferença.
 * `availableAt` (pagamento + `Brand.commissionHoldDays`) ficou só informativo: a comissão é liberada no fechamento
 * do mês (D-CONTRACT, `src/lib/commission/release.ts`).
 */

export type PostOutcome =
  | { status: "posted"; entry: LedgerEntryDraft }
  | { status: "nothing" }
  | { status: "skipped"; reason: "no_attribution" | "no_rate" | "taxes_included" | "currency_not_brl" };

export async function postCommission(prisma: PrismaClient, orderId: string, now = new Date()): Promise<PostOutcome> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`commission:${orderId}`}))`;
    const order = await tx.order.findUniqueOrThrow({
      where: { id: orderId },
      include: { attribution: true, brand: { select: { commissionHoldDays: true } } },
    });
    const a = order.attribution;
    if (!a) return { status: "skipped", reason: "no_attribution" } as const;
    if (a.rateBps === null) return { status: "skipped", reason: "no_rate" } as const;
    // D-TAX: loja sem imposto incluso; pedido que vier diferente fica bloqueado (aparece como aviso no sync).
    if (order.taxesIncluded) return { status: "skipped", reason: "taxes_included" } as const;
    if (order.currency !== "BRL") return { status: "skipped", reason: "currency_not_brl" } as const;

    const posted = await tx.ledgerEntry.aggregate({
      where: { orderId, type: { in: ["COMMISSION", "REVERSAL"] } },
      _sum: { amountCents: true },
    });
    const entry = computeCommissionEntry({
      order: {
        id: order.id,
        financialStatus: order.financialStatus,
        cancelledAt: order.cancelledAt,
        test: order.test,
        subtotalCents: order.subtotalCents,
        paidAt: order.paidAt,
        version: order.shopifyUpdatedAt,
      },
      frozenRateBps: a.rateBps,
      postedCents: posted._sum.amountCents ?? 0,
      holdDays: order.brand.commissionHoldDays,
      now,
    });
    if (!entry) return { status: "nothing" } as const;
    const { count } = await tx.ledgerEntry.createMany({
      data: [{ ...entry, brandId: order.brandId, creatorId: a.creatorId }],
      skipDuplicates: true,
    });
    return count === 1 ? ({ status: "posted", entry } as const) : ({ status: "nothing" } as const);
  });
}

/** Depois de gravar um pedido: decide a atribuição (se ainda não decidida) e lança a comissão devida. */
export async function settleOrder(prisma: PrismaClient, orderId: string, now = new Date()): Promise<{ attribution: AttributionOutcome; post: PostOutcome }> {
  const attribution = await decideAttribution(prisma, orderId);
  const post = await postCommission(prisma, orderId, now);
  return { attribution, post };
}

/**
 * Rede de segurança (E5.5): pedido pago, com dona e taxa congelada, mas sem nenhum lançamento — por exemplo, uma falha
 * entre atribuir e lançar. Nada mais o reavalia (`recheckBrand` só olha pedido sem dona ou sem taxa), então roda a cada
 * reconciliação. `postCommission` é idempotente: repetir não duplica.
 */
export async function sweepUnpostedCommissions(prisma: PrismaClient, brandId: string, now = new Date()): Promise<number> {
  const orders = await prisma.order.findMany({
    where: {
      brandId,
      test: false,
      cancelledAt: null,
      financialStatus: { in: ["PAID", "PARTIALLY_REFUNDED"] },
      attribution: { rateBps: { not: null } },
      ledgerEntries: { none: {} },
    },
    select: { id: true },
    orderBy: { paidAt: "asc" },
    take: 200,
  });
  let posted = 0;
  for (const { id } of orders) if ((await postCommission(prisma, id, now)).status === "posted") posted++;
  return posted;
}
