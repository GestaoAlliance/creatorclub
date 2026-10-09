import type { PrismaClient } from "@/generated/prisma/client";
import { assertBps } from "@/domain";
import type { Actor } from "@/lib/auth/actor";
import { can } from "@/lib/auth/permissions";

/**
 * Conferência da Ana (E4.3, D-CLASS / D-RATEIMPORT): classificar cada cupom em CREATOR ou PROMO e confirmar a dona
 * e a taxa. Só quem edita creators da marca (Gestão ou super admin). Tudo vai para a auditoria.
 * Confirmar só vale para o que ainda está "a confirmar": mudar taxa ou dona já confirmadas é outra operação (com
 * vigência nova), fora desta tela.
 */

export class ReviewError extends Error {}

function assertCanEdit(actor: Actor | null, brandId: string): asserts actor is Actor {
  if (!actor || !can(actor.grants, "creators.edit", brandId)) throw new ReviewError("Sem permissão.");
}

export async function couponReview(prisma: PrismaClient, actor: Actor | null, brandId: string) {
  assertCanEdit(actor, brandId);
  const [coupons, creators] = await Promise.all([
    prisma.coupon.findMany({
      where: { brandId },
      orderBy: { code: "asc" },
      include: {
        assignments: {
          where: { validTo: null },
          include: {
            creator: {
              include: {
                account: { select: { name: true } },
                commissionPolicies: { where: { validTo: null }, orderBy: { validFrom: "desc" }, take: 1 },
              },
            },
          },
        },
      },
    }),
    prisma.creator.findMany({
      where: { brandId },
      orderBy: { account: { name: "asc" } },
      select: { id: true, status: true, account: { select: { name: true } } },
    }),
  ]);
  const uses = await Promise.all(coupons.map((c) => prisma.order.count({ where: { brandId, discountCodes: { has: c.code } } })));

  const rows = coupons.map((c, i) => {
    const a = c.assignments[0] ?? null;
    const policy = a?.creator.commissionPolicies[0] ?? null;
    return {
      id: c.id,
      code: c.code,
      kind: c.kind,
      uses: uses[i]!,
      owner: a ? { assignmentId: a.id, creatorId: a.creatorId, name: a.creator.account.name, since: a.validFrom, confirmed: a.confirmedAt !== null } : null,
      rate: policy ? { policyId: policy.id, rateBps: policy.rateBps, confirmed: policy.confirmedAt !== null } : null,
    };
  });

  // Pronto (E4) = toda creator ativa com um cupom CREATOR de dona confirmada e taxa confirmada.
  const active = creators.filter((c) => c.status === "ACTIVE");
  const done = new Set(
    rows.filter((r) => r.kind === "CREATOR" && r.owner?.confirmed && r.rate?.confirmed).map((r) => r.owner!.creatorId),
  );
  return {
    rows,
    creators: creators.map((c) => ({ id: c.id, name: c.account.name, status: c.status })),
    progress: { activeCreators: active.length, confirmed: active.filter((c) => done.has(c.id)).length },
  };
}

export async function classifyCoupon(prisma: PrismaClient, actor: Actor | null, couponId: string, kind: "CREATOR" | "PROMO") {
  const coupon = await prisma.coupon.findUnique({ where: { id: couponId }, include: { _count: { select: { attributions: true } } } });
  if (!coupon) throw new ReviewError("Cupom não encontrado.");
  assertCanEdit(actor, coupon.brandId);
  if (coupon.kind === kind) return;
  if (coupon.kind && coupon._count.attributions > 0) {
    throw new ReviewError("Este cupom já levou pedidos; mudar o tipo agora mudaria o passado.");
  }
  await prisma.$transaction([
    prisma.coupon.update({ where: { id: couponId }, data: { kind, classifiedAt: new Date(), classifiedById: actor.userId } }),
    prisma.auditLog.create({
      data: {
        brandId: coupon.brandId,
        actorType: "USER",
        actorId: actor.userId,
        action: "coupon.classify",
        entity: "Coupon",
        entityId: couponId,
        before: { kind: coupon.kind },
        after: { kind, code: coupon.code },
      },
    }),
  ]);
}

/**
 * Confirma a dona do cupom CREATOR. Se a dona importada estiver errada, troca antes de confirmar (só enquanto ainda
 * não confirmada). Cupom sem dona: cria a vigência a partir de `since`.
 */
export async function confirmOwner(
  prisma: PrismaClient,
  actor: Actor | null,
  input: { couponId: string; creatorId: string; since?: Date },
) {
  const coupon = await prisma.coupon.findUnique({ where: { id: input.couponId } });
  if (!coupon) throw new ReviewError("Cupom não encontrado.");
  assertCanEdit(actor, coupon.brandId);
  if (coupon.kind !== "CREATOR") throw new ReviewError("Classifique o cupom como CREATOR antes de confirmar a dona.");
  const creator = await prisma.creator.findUnique({ where: { id: input.creatorId } });
  if (!creator || creator.brandId !== coupon.brandId) throw new ReviewError("Creator não encontrada nesta marca.");

  const current = await prisma.couponAssignment.findFirst({ where: { couponId: coupon.id, validTo: null } });
  if (current?.confirmedAt) throw new ReviewError("A dona deste cupom já foi confirmada.");
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    let assignmentId: string;
    if (current) {
      await tx.couponAssignment.update({
        where: { id: current.id },
        data: { creatorId: creator.id, confirmedAt: now, confirmedById: actor.userId },
      });
      assignmentId = current.id;
    } else {
      if (!input.since || Number.isNaN(input.since.getTime())) throw new ReviewError("Informe desde quando o cupom é dela.");
      const created = await tx.couponAssignment.create({
        data: {
          brandId: coupon.brandId,
          couponId: coupon.id,
          creatorId: creator.id,
          validFrom: input.since,
          createdById: actor.userId,
          confirmedAt: now,
          confirmedById: actor.userId,
        },
      });
      assignmentId = created.id;
    }
    await tx.auditLog.create({
      data: {
        brandId: coupon.brandId,
        actorType: "USER",
        actorId: actor.userId,
        action: "coupon.owner.confirm",
        entity: "CouponAssignment",
        entityId: assignmentId,
        ...(current ? { before: { creatorId: current.creatorId } } : {}),
        after: { creatorId: creator.id, code: coupon.code },
      },
    });
  });
}

/** Confirma a taxa "a confirmar" da creator, corrigindo o valor antes se preciso. */
export async function confirmRate(prisma: PrismaClient, actor: Actor | null, input: { policyId: string; rateBps: number }) {
  const policy = await prisma.commissionPolicy.findUnique({ where: { id: input.policyId } });
  if (!policy) throw new ReviewError("Taxa não encontrada.");
  assertCanEdit(actor, policy.brandId);
  if (policy.confirmedAt) throw new ReviewError("Esta taxa já foi confirmada.");
  try {
    assertBps(input.rateBps);
  } catch {
    throw new ReviewError("Taxa inválida.");
  }
  await prisma.$transaction([
    prisma.commissionPolicy.update({
      where: { id: policy.id },
      data: { rateBps: input.rateBps, confirmedAt: new Date(), confirmedById: actor.userId },
    }),
    prisma.auditLog.create({
      data: {
        brandId: policy.brandId,
        actorType: "USER",
        actorId: actor.userId,
        action: "commission.confirm",
        entity: "CommissionPolicy",
        entityId: policy.id,
        before: { rateBps: policy.rateBps },
        after: { rateBps: input.rateBps, creatorId: policy.creatorId },
      },
    }),
  ]);
}

/** "15" ou "15,5" (por cento) → pontos-base, sem Float. */
export function percentToBps(input: string): number {
  const m = /^\s*(\d{1,3})(?:[.,](\d{1,2}))?\s*%?\s*$/.exec(input);
  if (!m) throw new ReviewError("Taxa inválida. Use, por exemplo, 15 ou 12,5.");
  const bps = Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0"));
  if (bps > 10_000) throw new ReviewError("Taxa acima de 100%.");
  return bps;
}
