import type { PrismaClient } from "@/generated/prisma/client";
import type { Actor } from "@/lib/auth/actor";
import { CONTRACT_WARN_DAYS, dayKey } from "@/domain";
import { brandsWith, type Permission } from "@/lib/auth/permissions";

/** Hoje (dia de São Paulo) + n dias, como data UTC à meia-noite (formato das colunas `@db.Date`). */
const today = (plusDays = 0) => new Date(Date.parse(`${dayKey(new Date())}T00:00:00Z`) + plusDays * 86_400_000);

/**
 * Início do painel da equipe (D-DESIGNALL): o que cada papel tem para fazer agora, com o atalho para a tela.
 * Só os números que a pessoa pode ver; nada de dado pessoal.
 */
export type StaffHome = {
  creators?: { active: number; toReview: number; applications: number; contractsExpiring: number; contractsExpired: number };
  coupons?: { unclassified: number; ownerPending: number };
  shipments?: { preparing: number; shipped: number; kitsPending: number };
  withdrawals?: { open: number; openCents: number; openingsPending: number };
};

function scope(actor: Actor, p: Permission) {
  const b = brandsWith(actor.grants, p);
  if (b !== "ALL" && b.length === 0) return null;
  return b === "ALL" ? {} : { brandId: { in: b } };
}

export async function staffHome(prisma: PrismaClient, actor: Actor): Promise<StaffHome> {
  const out: StaffHome = {};
  const view = scope(actor, "creators.view");
  const edit = scope(actor, "creators.edit");
  const ship = scope(actor, "shipping.view");
  const pay = scope(actor, "withdrawals.manage");
  await Promise.all([
    view &&
      Promise.all([
        prisma.creator.count({ where: { ...view, status: "ACTIVE" } }),
        prisma.creator.count({ where: { ...view, status: { not: "DEACTIVATED" }, reviewedAt: null } }),
        prisma.creatorApplication.count({ where: { ...view, status: "NEW" } }),
        // D-CHECKLIST: fim do contrato em até 30 dias / já chegou (pelo dia de São Paulo).
        prisma.creator.count({ where: { ...view, status: { not: "DEACTIVATED" }, contractEnd: { gt: today(), lte: today(CONTRACT_WARN_DAYS) } } }),
        prisma.creator.count({ where: { ...view, status: { not: "DEACTIVATED" }, contractEnd: { lte: today() } } }),
      ]).then(
        ([active, toReview, applications, contractsExpiring, contractsExpired]) =>
          (out.creators = { active, toReview, applications, contractsExpiring, contractsExpired }),
      ),
    edit &&
      Promise.all([
        prisma.coupon.count({ where: { ...edit, kind: null, active: true } }),
        prisma.couponAssignment.count({ where: { ...edit, confirmedAt: null, validTo: null, coupon: { kind: "CREATOR" } } }),
      ]).then(([unclassified, ownerPending]) => (out.coupons = { unclassified, ownerPending })),
    ship &&
      Promise.all([
        prisma.shipment.count({ where: { ...ship, status: "PREPARING" } }),
        prisma.shipment.count({ where: { ...ship, status: "SHIPPED" } }),
        prisma.kitGrant.count({ where: { ...ship, status: "PENDING" } }), // D-KIT: esperando a creator escolher
      ]).then(([preparing, shipped, kitsPending]) => (out.shipments = { preparing, shipped, kitsPending })),
    pay &&
      Promise.all([
        prisma.withdrawal.aggregate({ where: { ...pay, status: "REQUESTED" }, _count: true, _sum: { amountCents: true } }),
        prisma.creator.count({ where: { ...pay, status: { not: "DEACTIVATED" }, withdrawalsUnlockedAt: null } }),
      ]).then(([w, openingsPending]) => (out.withdrawals = { open: w._count, openCents: w._sum.amountCents ?? 0, openingsPending })),
  ]);
  return out;
}
