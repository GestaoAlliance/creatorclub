import type { PrismaClient } from "@/generated/prisma/client";
import type { Actor } from "@/lib/auth/actor";
import { CONTRACT_WARN_DAYS, dayKey } from "@/domain";
import { brandsWith, type Permission } from "@/lib/auth/permissions";
import { IDLE_SELECT, idleFor } from "@/lib/creators/idle";

/** Hoje (dia de São Paulo) + n dias, como data UTC à meia-noite (formato das colunas `@db.Date`). */
const today = (plusDays = 0) => new Date(Date.parse(`${dayKey(new Date())}T00:00:00Z`) + plusDays * 86_400_000);

/**
 * Início do painel da equipe (D-DESIGNALL): o que cada papel tem para fazer agora, com o atalho para a tela.
 * Só os números que a pessoa pode ver; nada de dado pessoal.
 */
export type StaffHome = {
  creators?: { active: number; toReview: number; applications: number; contractsExpiring: number; contractsExpired: number; idle: number };
  coupons?: { unclassified: number; ownerPending: number };
  shipments?: { preparing: number; shipped: number; kitsPending: number };
  withdrawals?: { open: number; openCents: number; openingsPending: number };
  /** U3: a hunter vê as próprias indicações. */
  hunter?: { clicks30: number; inReview: number; approved: number; hasLink: boolean };
};

function scope(actor: Actor, p: Permission) {
  const b = brandsWith(actor.grants, p);
  if (b !== "ALL" && b.length === 0) return null;
  return b === "ALL" ? {} : { brandId: { in: b } };
}

/** D-IDLE60: ativas há 60 dias ou mais sem vender (cada marca no seu fuso). */
async function idleCount(prisma: PrismaClient, where: { brandId?: { in: string[] } }): Promise<number> {
  const creators = await prisma.creator.findMany({
    where: { ...where, status: "ACTIVE" },
    select: { ...IDLE_SELECT, brand: { select: { timezone: true } } },
  });
  const byTz = new Map<string, typeof creators>();
  for (const c of creators) byTz.set(c.brand.timezone, [...(byTz.get(c.brand.timezone) ?? []), c]);
  let n = 0;
  for (const [tz, list] of byTz) for (const s of (await idleFor(prisma, list, tz)).values()) if (s?.idle) n++;
  return n;
}

export async function staffHome(prisma: PrismaClient, actor: Actor): Promise<StaffHome> {
  const out: StaffHome = {};
  const view = scope(actor, "creators.view");
  const edit = scope(actor, "creators.edit");
  const ship = scope(actor, "shipping.view");
  const pay = scope(actor, "withdrawals.manage");
  const isHunter = actor.grants.some((g) => g.role === "HUNTER");
  await Promise.all([
    isHunter &&
      prisma.hunterLink
        .findMany({ where: { userId: actor.userId }, select: { id: true, applications: { select: { status: true } } } })
        .then(async (links) => {
          const ids = links.map((l) => l.id);
          const clicks30 = ids.length
            ? await prisma.hunterClick.count({ where: { hunterLinkId: { in: ids }, createdAt: { gte: new Date(Date.now() - 30 * 86_400_000) } } })
            : 0;
          const apps = links.flatMap((l) => l.applications);
          out.hunter = {
            clicks30,
            inReview: apps.filter((a) => a.status === "NEW").length,
            approved: apps.filter((a) => a.status === "APPROVED").length,
            hasLink: links.length > 0,
          };
        }),
    view &&
      Promise.all([
        prisma.creator.count({ where: { ...view, status: "ACTIVE" } }),
        prisma.creator.count({ where: { ...view, status: { not: "DEACTIVATED" }, reviewedAt: null } }),
        prisma.creatorApplication.count({ where: { ...view, status: "NEW" } }),
        // D-CHECKLIST: fim do contrato em até 30 dias / já chegou (pelo dia de São Paulo).
        prisma.creator.count({ where: { ...view, status: { not: "DEACTIVATED" }, contractEnd: { gt: today(), lte: today(CONTRACT_WARN_DAYS) } } }),
        prisma.creator.count({ where: { ...view, status: { not: "DEACTIVATED" }, contractEnd: { lte: today() } } }),
        idleCount(prisma, view),
      ]).then(
        ([active, toReview, applications, contractsExpiring, contractsExpired, idle]) =>
          (out.creators = { active, toReview, applications, contractsExpiring, contractsExpired, idle }),
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
