import type { PrismaClient } from "@/generated/prisma/client";
import { dayKey, PAID_FINANCIAL, suggestOwner } from "@/domain";
import type { Actor } from "@/lib/auth/actor";
import { classifyCoupon, confirmOwner, confirmRate, couponReview, ReviewError } from "./review";

/**
 * Tela Cupons (D-COUPONBOARD, pedido do responsável em 2026-11-12): a conferência da Ana (E4.3) com contexto e
 * atalhos. Cada cupom: pedidos, vendas (pagas, não canceladas, não teste), vendas em 30 dias, primeiro e último uso e,
 * nos que esperam conferência, a comissão estimada parada (vendas pagas ainda sem creator × a comissão da dona ou a
 * padrão da marca). Sugestão de dona pelo código; confirmar dona e comissão num passo; vários sem tipo como PROMO de
 * uma vez; cupons de creator parados (sem uso há 60+ dias) e creators ativas sem cupom de creator.
 */

const DAY = 86_400_000;
export const COUPON_IDLE_DAYS = 60;

export async function couponBoard(prisma: PrismaClient, actor: Actor | null, brandId: string, now = new Date()) {
  const review = await couponReview(prisma, actor, brandId);
  const [brand, orders, people] = await Promise.all([
    prisma.brand.findUniqueOrThrow({ where: { id: brandId }, select: { timezone: true, defaultCommissionBps: true } }),
    prisma.order.findMany({
      where: { brandId, test: false, NOT: { discountCodes: { isEmpty: true } } },
      select: { discountCodes: true, subtotalCents: true, createdAtShop: true, paidAt: true, financialStatus: true, cancelledAt: true, attribution: { select: { id: true } } },
    }),
    prisma.creator.findMany({
      where: { brandId, archivedAt: null, status: { not: "DEACTIVATED" } },
      select: { id: true, status: true, awaitingContractAt: true, account: { select: { name: true, instagram: true, tiktok: true } }, commissionPolicies: { where: { validTo: null }, orderBy: { validFrom: "desc" }, take: 1, select: { rateBps: true } } },
    }),
  ]);
  const since30 = now.getTime() - 30 * DAY;
  type Stat = { orders: number; salesCents: number; sales30Cents: number; waitingCents: number; first: Date | null; last: Date | null };
  const stats = new Map<string, Stat>();
  for (const o of orders) {
    const paid = !o.cancelledAt && (PAID_FINANCIAL as readonly string[]).includes(o.financialStatus);
    for (const raw of new Set(o.discountCodes.map((c) => c.toUpperCase()))) {
      const s = stats.get(raw) ?? { orders: 0, salesCents: 0, sales30Cents: 0, waitingCents: 0, first: null, last: null };
      s.orders++;
      if (!s.first || o.createdAtShop < s.first) s.first = o.createdAtShop;
      if (!s.last || o.createdAtShop > s.last) s.last = o.createdAtShop;
      if (paid) {
        s.salesCents += o.subtotalCents;
        if ((o.paidAt ?? o.createdAtShop).getTime() >= since30) s.sales30Cents += o.subtotalCents;
        if (!o.attribution) s.waitingCents += o.subtotalCents;
      }
      stats.set(raw, s);
    }
  }
  const creators = people.map((p) => ({ id: p.id, name: p.account.name, instagram: p.account.instagram, tiktok: p.account.tiktok, rateBps: p.commissionPolicies[0]?.rateBps ?? null }));
  const byId = new Map(creators.map((c) => [c.id, c]));
  const idleBefore = now.getTime() - COUPON_IDLE_DAYS * DAY;
  const rows = review.rows.map((r) => {
    const s = stats.get(r.code.toUpperCase()) ?? { orders: 0, salesCents: 0, sales30Cents: 0, waitingCents: 0, first: null, last: null };
    const pending = r.kind === null || (r.kind === "CREATOR" && (!r.owner?.confirmed || !r.rate?.confirmed));
    const suggestion = pending && r.kind !== "PROMO" && !r.owner?.confirmed ? suggestOwner(r.code, creators) : null;
    const ownerRate = r.owner ? (byId.get(r.owner.creatorId)?.rateBps ?? null) : null;
    const rate = r.rate?.rateBps ?? ownerRate ?? suggestion?.rateBps ?? brand.defaultCommissionBps;
    return {
      ...r,
      orders: s.orders,
      salesCents: s.salesCents,
      sales30Cents: s.sales30Cents,
      firstUse: s.first ? dayKey(s.first, brand.timezone) : null,
      lastUse: s.last ? dayKey(s.last, brand.timezone) : null,
      idle: r.kind === "CREATOR" && (!s.last || s.last.getTime() < idleBefore),
      pending,
      waitingCommissionCents: pending && r.kind !== "PROMO" ? Math.round((s.waitingCents * rate) / 10_000) : 0,
      suggestion: suggestion ? { creatorId: suggestion.id, name: suggestion.name } : null,
    };
  });
  const withCoupon = new Set(rows.filter((r) => r.kind === "CREATOR" && r.owner).map((r) => r.owner!.creatorId));
  const withoutCoupon = people
    .filter((p) => p.status === "ACTIVE" && !p.awaitingContractAt && !withCoupon.has(p.id))
    .map((p) => ({ id: p.id, name: p.account.name }))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  return { rows, creators: review.creators, progress: review.progress, withoutCoupon, defaultRateBps: brand.defaultCommissionBps };
}

/** Confirma a dona (classificando como CREATOR se ainda sem tipo) e, se a comissão dela ainda está a confirmar, a comissão no mesmo passo. */
export async function confirmOwnerAndRate(prisma: PrismaClient, actor: Actor | null, input: { couponId: string; creatorId: string; since?: Date; rateBps?: number }) {
  // Cupom ainda sem tipo: escolher a dona já diz que é de creator.
  const coupon = await prisma.coupon.findUnique({ where: { id: input.couponId }, select: { kind: true } });
  if (coupon && coupon.kind === null) await classifyCoupon(prisma, actor, input.couponId, "CREATOR");
  await confirmOwner(prisma, actor, input);
  if (input.rateBps === undefined) return { rate: false };
  const policy = await prisma.commissionPolicy.findFirst({ where: { creatorId: input.creatorId, validTo: null, confirmedAt: null }, orderBy: { validFrom: "desc" }, select: { id: true } });
  if (!policy) return { rate: false };
  await confirmRate(prisma, actor, { policyId: policy.id, rateBps: input.rateBps });
  return { rate: true };
}

/** Vários cupons sem tipo como PROMO de uma vez (cada um vai para a auditoria). */
export async function classifyManyPromo(prisma: PrismaClient, actor: Actor | null, couponIds: readonly string[]) {
  if (!couponIds.length) throw new ReviewError("Marque pelo menos um cupom.");
  // Só os ainda sem tipo (trocar o tipo de um já classificado continua um a um, com as travas de lá).
  const open = await prisma.coupon.findMany({ where: { id: { in: [...new Set(couponIds)] }, kind: null }, select: { id: true } });
  let done = 0;
  for (const { id } of open) {
    await classifyCoupon(prisma, actor, id, "PROMO");
    done++;
  }
  return done;
}
