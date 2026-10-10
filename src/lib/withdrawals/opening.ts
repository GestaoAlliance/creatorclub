import type { PrismaClient } from "@/generated/prisma/client";
import type { Actor } from "@/lib/auth/actor";
import { brandsWith, can } from "@/lib/auth/permissions";

/**
 * Saldo de abertura (E6, D-OPEN, D-OPENFLOW). Para cada creator, o Pagamento (ou o super admin) informa quanto já
 * foi pago por fora antes do v2 (um total e uma observação). Ao aprovar:
 * - o total entra no extrato como "Saldo de abertura", negativo (só se for maior que zero; no máximo um por
 *   creator: `LedgerEntry_one_opening_per_creator`);
 * - o saque da creator é liberado (D-WDLOCK).
 * Só depois da conferência da Ana (D-ANAREVIEW: ela marca "Conferi os números" na ficha; cupons e taxa também
 * confirmados), porque a comissão pode mudar até lá.
 * Saldo negativo é aceito com aviso (D-NEG). Correção depois: ajuste manual (super admin).
 */

export class OpeningError extends Error {}

export type OpeningRow = {
  creatorId: string;
  brandId: string;
  name: string;
  status: "ACTIVE" | "INACTIVE" | "DEACTIVATED";
  /** Soma do extrato hoje (comissões, estornos, ajustes, saques). */
  ledgerCents: number;
  /** A Ana conferiu (D-ANAREVIEW) e cupons e taxa estão confirmados. */
  ready: boolean;
  unlockedAt: Date | null;
  openingCents: number | null;
  openingNote: string | null;
  /** Pagamentos da planilha da equipe (D-LEGACYPAY), por mês: sugerem o "já pago". */
  legacyPayments: { month: string; amountCents: number }[];
};

function assertManage(actor: Actor | null, brandId: string): asserts actor is Actor {
  if (!actor || !can(actor.grants, "withdrawals.manage", brandId)) throw new OpeningError("Sem permissão para o saldo de abertura.");
}

type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

async function isReady(prisma: PrismaClient | Tx, creatorId: string): Promise<boolean> {
  const c = await prisma.creator.findUniqueOrThrow({ where: { id: creatorId }, select: { reviewedAt: true } });
  if (!c.reviewedAt) return false;
  const [assignments, policies] = await Promise.all([
    prisma.couponAssignment.findMany({ where: { creatorId, coupon: { kind: "CREATOR" } }, select: { confirmedAt: true } }),
    prisma.commissionPolicy.findMany({ where: { creatorId }, select: { confirmedAt: true } }),
  ]);
  return assignments.length > 0 && policies.length > 0 && [...assignments, ...policies].every((x) => x.confirmedAt !== null);
}

export async function openingList(prisma: PrismaClient, actor: Actor | null): Promise<OpeningRow[]> {
  if (!actor) throw new OpeningError("Sem permissão para o saldo de abertura.");
  const brands = brandsWith(actor.grants, "withdrawals.manage");
  if (brands !== "ALL" && brands.length === 0) throw new OpeningError("Sem permissão para o saldo de abertura.");
  const creators = await prisma.creator.findMany({
    where: brands === "ALL" ? {} : { brandId: { in: brands } },
    orderBy: { account: { name: "asc" } },
    select: {
      id: true,
      brandId: true,
      status: true,
      withdrawalsUnlockedAt: true,
      reviewedAt: true,
      account: { select: { name: true } },
      couponAssignments: { where: { coupon: { kind: "CREATOR" } }, select: { confirmedAt: true } },
      commissionPolicies: { select: { confirmedAt: true } },
    },
  });
  const ids = creators.map((c) => c.id);
  const [sums, openings, legacy] = await Promise.all([
    prisma.ledgerEntry.groupBy({ by: ["creatorId"], where: { creatorId: { in: ids } }, _sum: { amountCents: true } }),
    prisma.ledgerEntry.findMany({ where: { creatorId: { in: ids }, type: "OPENING_BALANCE" }, select: { creatorId: true, amountCents: true, note: true } }),
    prisma.legacyPayment.groupBy({ by: ["creatorId", "month"], where: { creatorId: { in: ids } }, _sum: { amountCents: true }, orderBy: { month: "asc" } }),
  ]);
  const sum = new Map(sums.map((s) => [s.creatorId, s._sum.amountCents ?? 0]));
  const opening = new Map(openings.map((o) => [o.creatorId, o]));
  return creators.map((c) => ({
    creatorId: c.id,
    brandId: c.brandId,
    name: c.account.name,
    status: c.status,
    ledgerCents: sum.get(c.id) ?? 0,
    ready:
      c.reviewedAt !== null &&
      c.couponAssignments.length > 0 && c.commissionPolicies.length > 0 && [...c.couponAssignments, ...c.commissionPolicies].every((x) => x.confirmedAt !== null),
    unlockedAt: c.withdrawalsUnlockedAt,
    openingCents: opening.get(c.id)?.amountCents ?? null,
    openingNote: opening.get(c.id)?.note ?? null,
    legacyPayments: legacy.filter((l) => l.creatorId === c.id).map((l) => ({ month: l.month, amountCents: l._sum.amountCents ?? 0 })),
  }));
}

export async function approveOpening(
  prisma: PrismaClient,
  actor: Actor | null,
  input: { creatorId: string; alreadyPaidCents: number; note: string },
  now = new Date(),
): Promise<{ balanceCents: number }> {
  const creator = await prisma.creator.findUnique({ where: { id: input.creatorId }, select: { id: true, brandId: true } });
  if (!creator) throw new OpeningError("Creator não encontrada.");
  assertManage(actor, creator.brandId);
  if (!Number.isInteger(input.alreadyPaidCents) || input.alreadyPaidCents < 0) throw new OpeningError("Informe quanto já foi pago (zero se nada).");
  const note = input.note.trim().replace(/\s+/g, " ").slice(0, 300);
  if (input.alreadyPaidCents > 0 && !note) throw new OpeningError("Descreva os pagamentos já feitos (datas e meios).");

  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Creator" WHERE id = ${creator.id} FOR UPDATE`;
    const fresh = await tx.creator.findUniqueOrThrow({ where: { id: creator.id }, select: { withdrawalsUnlockedAt: true } });
    if (fresh.withdrawalsUnlockedAt) throw new OpeningError("O saldo de abertura desta creator já foi aprovado.");
    if (!(await isReady(tx, creator.id))) throw new OpeningError("Aguardando a conferência da Ana (cupons e taxa desta creator).");
    if (input.alreadyPaidCents > 0) {
      await tx.ledgerEntry.create({
        data: {
          brandId: creator.brandId,
          creatorId: creator.id,
          type: "OPENING_BALANCE",
          amountCents: -input.alreadyPaidCents,
          availableAt: now,
          idempotencyKey: `opening:${creator.id}`,
          note: `Já pago antes do Creator Club: ${note}`,
          createdById: actor.userId,
        },
      });
    }
    await tx.creator.update({ where: { id: creator.id }, data: { withdrawalsUnlockedAt: now, withdrawalsUnlockedById: actor.userId } });
    const total = await tx.ledgerEntry.aggregate({ where: { creatorId: creator.id }, _sum: { amountCents: true } });
    const balanceCents = total._sum.amountCents ?? 0;
    await tx.auditLog.create({
      data: {
        brandId: creator.brandId,
        actorType: "USER",
        actorId: actor.userId,
        action: "creator.opening_approved",
        entity: "Creator",
        entityId: creator.id,
        after: { alreadyPaidCents: input.alreadyPaidCents, note, balanceCents },
      },
    });
    return { balanceCents };
  });
}

/** A Ana (Gestão ou super admin: `creators.edit`) marca que conferiu os números da creator (D-ANAREVIEW). */
export async function markReviewed(prisma: PrismaClient, actor: Actor | null, creatorId: string, now = new Date()) {
  const creator = await prisma.creator.findUnique({ where: { id: creatorId }, select: { id: true, brandId: true } });
  if (!creator) throw new OpeningError("Creator não encontrada.");
  if (!actor || !can(actor.grants, "creators.edit", creator.brandId)) throw new OpeningError("Sem permissão.");
  await prisma.$transaction(async (tx) => {
    const { count } = await tx.creator.updateMany({ where: { id: creator.id, reviewedAt: null }, data: { reviewedAt: now, reviewedById: actor.userId } });
    if (count === 0) throw new OpeningError("Esta creator já foi conferida.");
    await tx.auditLog.create({
      data: { brandId: creator.brandId, actorType: "USER", actorId: actor.userId, action: "creator.reviewed", entity: "Creator", entityId: creator.id },
    });
  });
}
