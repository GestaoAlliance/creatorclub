import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import {
  ATTRIBUTION_RULE,
  attributeOrder,
  isPending,
  PolicyError,
  rateAt,
  type CommissionPolicy,
  type CouponAssignment,
  type PendingAttribution,
} from "@/domain";
import { enqueueJob } from "@/lib/jobs/queue";

/**
 * Atribuição no banco (E5.1). Cada pedido decide a dona **uma vez** (`OrderAttribution`, com os códigos como
 * evidência). A taxa é congelada quando o pedido está pago, pela política vigente no pagamento (D-PAIDAT) e só se
 * confirmada (D-RATEIMPORT). Pedido pendente (D-PENDING) não grava nada e é reavaliado em `recheckBrand`.
 */

const EPOCH = new Date(0);

/** Cupons da marca no formato do domínio: uma entrada por vigência de dona; cupom sem dona vira uma entrada sem dona. */
export async function brandAssignments(prisma: PrismaClient | Prisma.TransactionClient, brandId: string): Promise<CouponAssignment[]> {
  const coupons = await prisma.coupon.findMany({ where: { brandId }, include: { assignments: true } });
  return coupons.flatMap((c): CouponAssignment[] =>
    c.assignments.length === 0 || c.kind === "PROMO"
      ? [{ couponId: c.id, brandId, code: c.code, kind: c.kind, creatorId: null, confirmed: c.kind === "PROMO", validFrom: EPOCH, validTo: null }]
      : c.assignments.map((a) => ({
          couponId: c.id,
          brandId,
          code: c.code,
          kind: c.kind,
          creatorId: a.creatorId,
          confirmed: a.confirmedAt !== null,
          validFrom: a.validFrom,
          validTo: a.validTo,
        })),
  );
}

async function creatorPolicies(prisma: PrismaClient, creatorId: string): Promise<CommissionPolicy[]> {
  const rows = await prisma.commissionPolicy.findMany({ where: { creatorId } });
  return rows.map((p) => ({ id: p.id, creatorId: p.creatorId, rateBps: p.rateBps, validFrom: p.validFrom, validTo: p.validTo, confirmed: p.confirmedAt !== null }));
}

/** Taxa congelável agora: só com pedido pago e política confirmada cobrindo o pagamento. */
async function freezableRate(prisma: PrismaClient, creatorId: string, paidAt: Date | null): Promise<number | null> {
  if (!paidAt) return null;
  try {
    return rateAt(await creatorPolicies(prisma, creatorId), creatorId, paidAt);
  } catch (error) {
    if (error instanceof PolicyError) return null; // sem taxa vigente ou a confirmar: tenta de novo depois
    throw error;
  }
}

export type AttributionOutcome =
  | { status: "attributed"; creatorId: string; rateBps: number | null }
  | { status: "rate_frozen"; rateBps: number }
  | { status: "unchanged" }
  | { status: "none" }
  | { status: "pending"; reason: PendingAttribution["reason"]; code: string };

export async function decideAttribution(prisma: PrismaClient, orderId: string, assignments?: CouponAssignment[]): Promise<AttributionOutcome> {
  const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId }, include: { attribution: true } });

  if (order.attribution) {
    if (order.attribution.rateBps !== null) return { status: "unchanged" };
    const rate = await freezableRate(prisma, order.attribution.creatorId, order.paidAt);
    if (rate === null) return { status: "unchanged" };
    // Congela uma única vez: só grava se ainda estiver vazia.
    const { count } = await prisma.orderAttribution.updateMany({ where: { id: order.attribution.id, rateBps: null }, data: { rateBps: rate } });
    return count === 1 ? { status: "rate_frozen", rateBps: rate } : { status: "unchanged" };
  }

  if (order.discountCodes.length === 0) return { status: "none" };
  const decided = attributeOrder(
    { brandId: order.brandId, discountCodes: order.discountCodes, orderCreatedAt: order.createdAtShop },
    assignments ?? (await brandAssignments(prisma, order.brandId)),
  );
  if (!decided) return { status: "none" };
  if (isPending(decided)) return { status: "pending", reason: decided.reason, code: decided.code };

  const rateBps = await freezableRate(prisma, decided.creatorId, order.paidAt);
  const { count } = await prisma.orderAttribution.createMany({
    data: [
      {
        brandId: order.brandId,
        orderId: order.id,
        creatorId: decided.creatorId,
        couponId: decided.couponId,
        rateBps,
        rule: ATTRIBUTION_RULE,
        evidenceCodes: decided.evidenceCodes,
      },
    ],
    skipDuplicates: true, // decidido uma vez: corrida com outro worker não grava de novo
  });
  return count === 1 ? { status: "attributed", creatorId: decided.creatorId, rateBps } : { status: "unchanged" };
}

export type RecheckResult = { checked: number; attributed: number; frozen: number; pending: number };

/** Reavalia pedidos sem atribuição (com cupom) e atribuições pagas sem taxa congelada. */
export async function recheckBrand(prisma: PrismaClient, brandId: string): Promise<RecheckResult> {
  const assignments = await brandAssignments(prisma, brandId);
  const orders = await prisma.order.findMany({
    where: {
      brandId,
      OR: [{ attribution: null, NOT: { discountCodes: { isEmpty: true } } }, { attribution: { rateBps: null }, paidAt: { not: null } }],
    },
    select: { id: true },
  });
  const result: RecheckResult = { checked: orders.length, attributed: 0, frozen: 0, pending: 0 };
  for (const { id } of orders) {
    const r = await decideAttribution(prisma, id, assignments);
    if (r.status === "attributed") result.attributed++;
    else if (r.status === "rate_frozen") result.frozen++;
    else if (r.status === "pending") result.pending++;
  }
  return result;
}

export const RECHECK_JOB = "attribution.recheck";

/** Pede reavaliação da marca (depois de uma confirmação da Ana). No máximo uma por minuto. */
export function enqueueRecheck(tx: PrismaClient | Prisma.TransactionClient, brandId: string, now = new Date()) {
  return enqueueJob(tx, { type: RECHECK_JOB, brandId, dedupeKey: `recheck:${brandId}:${Math.floor(now.getTime() / 60_000)}` });
}
