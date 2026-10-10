import type { PrismaClient } from "@/generated/prisma/client";
import { assertBps, computeCommissionEntry } from "@/domain";
import type { Actor } from "@/lib/auth/actor";
import { can } from "@/lib/auth/permissions";

/**
 * Correção de taxa desde o início (D-RATEFIX). A taxa do app antigo entrou como provisória (D-RATEPROV); quando a
 * conferência acha a taxa errada, ela é corrigida para todo o período: a taxa da creator e a taxa gravada em cada
 * pedido mudam, e a diferença de cada pedido entra no extrato como novo lançamento (estorno ou comissão), nunca
 * editando o que já foi lançado. Só o super admin (`ledger.adjust`) e só enquanto o saque da creator está travado
 * (antes do saldo de abertura): depois disso, correção é ajuste manual.
 */

export class RateFixError extends Error {}

export async function correctRateSinceStart(
  prisma: PrismaClient,
  actor: Actor | null,
  creatorId: string,
  rateBps: number,
  now = new Date(),
): Promise<{ orders: number; deltaCents: number }> {
  const creator = await prisma.creator.findUnique({ where: { id: creatorId }, select: { brandId: true, withdrawalsUnlockedAt: true } });
  if (!creator) throw new RateFixError("Creator não encontrada.");
  if (!actor || !can(actor.grants, "ledger.adjust", creator.brandId)) throw new RateFixError("Só o super admin corrige a taxa desde o início.");
  try {
    assertBps(rateBps);
  } catch {
    throw new RateFixError("Taxa inválida.");
  }
  if (creator.withdrawalsUnlockedAt) throw new RateFixError("O saque desta creator já foi liberado; corrija com um ajuste no extrato.");

  return prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Creator" WHERE id = ${creatorId} FOR UPDATE`;
      const policies = await tx.commissionPolicy.findMany({ where: { creatorId } });
      if (policies.length !== 1) throw new RateFixError("A creator tem mais de uma taxa no histórico; corrija com ajustes no extrato.");
      const policy = policies[0]!;
      if (policy.rateBps === rateBps) throw new RateFixError("A taxa já é essa.");

      await tx.commissionPolicy.update({ where: { id: policy.id }, data: { rateBps, confirmedAt: now, confirmedById: actor.userId } });
      await tx.orderAttribution.updateMany({ where: { creatorId, rateBps: { not: null } }, data: { rateBps } });

      const orders = await tx.order.findMany({
        where: { attribution: { creatorId } },
        select: { id: true, financialStatus: true, cancelledAt: true, test: true, subtotalCents: true, paidAt: true, shopifyUpdatedAt: true, taxesIncluded: true, currency: true },
      });
      const posted = await tx.ledgerEntry.groupBy({
        by: ["orderId"],
        where: { creatorId, orderId: { in: orders.map((o) => o.id) }, type: { in: ["COMMISSION", "REVERSAL"] } },
        _sum: { amountCents: true },
      });
      const postedBy = new Map(posted.map((p) => [p.orderId!, p._sum.amountCents ?? 0]));
      const note = `Correção da taxa para ${(rateBps / 100).toString().replace(".", ",")}% desde o início`;
      const rows = [];
      for (const o of orders) {
        if (o.taxesIncluded || o.currency !== "BRL") continue;
        const entry = computeCommissionEntry({
          order: { id: o.id, financialStatus: o.financialStatus, cancelledAt: o.cancelledAt, test: o.test, subtotalCents: o.subtotalCents, paidAt: o.paidAt, version: o.shopifyUpdatedAt },
          frozenRateBps: rateBps,
          postedCents: postedBy.get(o.id) ?? 0,
          holdDays: 0,
          now,
        });
        if (!entry) continue;
        rows.push({ ...entry, brandId: creator.brandId, creatorId, idempotencyKey: `ratefix:${o.id}:${policy.id}:${rateBps}`, note, createdById: actor.userId, createdAt: now });
      }
      if (rows.length) await tx.ledgerEntry.createMany({ data: rows });
      const deltaCents = rows.reduce((s, r) => s + r.amountCents, 0);
      await tx.auditLog.create({
        data: {
          brandId: creator.brandId,
          actorType: "USER",
          actorId: actor.userId,
          action: "commission.correct",
          entity: "CommissionPolicy",
          entityId: policy.id,
          before: { rateBps: policy.rateBps },
          after: { rateBps, orders: rows.length, deltaCents },
        },
      });
      return { orders: rows.length, deltaCents };
    },
    { timeout: 30_000 },
  );
}
