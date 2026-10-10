import type { PrismaClient } from "@/generated/prisma/client";
import { assertBps, contractStatus } from "@/domain";
import { dayOf } from "./contract";
import type { Actor } from "@/lib/auth/actor";
import { can } from "@/lib/auth/permissions";
import { normalizeEmail } from "@/lib/auth/rules";
import { FAKE_EMAIL_DOMAIN } from "@/lib/import/legacy";

/**
 * Ficha da creator (E4.4): contato, situação (D-STATUS), cupons, taxa e convite.
 * Ver: `creators.view`; mudar: `creators.edit` da marca. CPF e Pix só para quem tem `personal.fiscal`.
 */

export class ProfileError extends Error {}

export const STATUS_LABEL = { ACTIVE: "Ativa", INACTIVE: "Pausada", DEACTIVATED: "Desligada" } as const;
export type CreatorStatusValue = keyof typeof STATUS_LABEL;

async function loadCreator(prisma: PrismaClient, creatorId: string) {
  const creator = await prisma.creator.findUnique({ where: { id: creatorId }, include: { account: true } });
  if (!creator) throw new ProfileError("Creator não encontrada.");
  return creator;
}

function audit(prisma: PrismaClient, actor: Actor, brandId: string, action: string, entity: string, entityId: string, before: object, after: object) {
  return prisma.auditLog.create({ data: { brandId, actorType: "USER", actorId: actor.userId, action, entity, entityId, before, after } });
}

export async function listCreators(prisma: PrismaClient, actor: Actor | null, brandId: string) {
  if (!actor || !can(actor.grants, "creators.view", brandId)) throw new ProfileError("Sem permissão.");
  const creators = await prisma.creator.findMany({
    where: { brandId },
    orderBy: { account: { name: "asc" } },
    include: { account: { select: { name: true, email: true, userId: true } } },
  });
  return creators.map((c) => ({
    id: c.id,
    name: c.account.name,
    status: c.status as CreatorStatusValue,
    fakeEmail: c.account.email.endsWith(FAKE_EMAIL_DOMAIN),
    hasLogin: c.account.userId !== null,
    reviewed: c.reviewedAt !== null,
    contract: contractStatus(dayOf(c.contractEnd), new Date()),
  }));
}

export async function creatorProfile(prisma: PrismaClient, actor: Actor | null, creatorId: string) {
  const creator = await loadCreator(prisma, creatorId);
  if (!actor || !can(actor.grants, "creators.view", creator.brandId)) throw new ProfileError("Sem permissão.");
  const fiscal = can(actor.grants, "personal.fiscal", creator.brandId);
  const money = can(actor.grants, "money.view", creator.brandId);
  const [assignments, policies, invites, adjustments] = await Promise.all([
    prisma.couponAssignment.findMany({ where: { creatorId }, orderBy: { validFrom: "desc" }, include: { coupon: true } }),
    prisma.commissionPolicy.findMany({ where: { creatorId }, orderBy: { validFrom: "desc" } }),
    prisma.creatorInvite.findMany({ where: { accountId: creator.accountId }, orderBy: { createdAt: "desc" }, take: 3 }),
    money
      ? prisma.ledgerEntry.findMany({ where: { creatorId, type: "ADJUSTMENT" }, orderBy: { createdAt: "desc" }, take: 20 })
      : Promise.resolve([]),
  ]);
  const a = creator.account;
  return {
    id: creator.id,
    brandId: creator.brandId,
    accountId: a.id,
    status: creator.status as CreatorStatusValue,
    canEdit: can(actor.grants, "creators.edit", creator.brandId),
    canAdjust: can(actor.grants, "ledger.adjust", creator.brandId),
    canViewAs: can(actor.grants, "portal.viewAs", creator.brandId),
    adjustments: money ? adjustments.map((e) => ({ at: e.createdAt, amountCents: e.amountCents, reason: e.note ?? "" })) : null,
    contact: { name: a.name, email: a.email, phone: a.phone, fakeEmail: a.email.endsWith(FAKE_EMAIL_DOMAIN) },
    fiscal: fiscal ? { cpf: a.cpf, cnpj: a.cnpj, pixKey: a.pixKey } : null,
    hasLogin: a.userId !== null,
    reviewedAt: creator.reviewedAt,
    withdrawalsUnlocked: creator.withdrawalsUnlockedAt !== null,
    categories: creator.categories,
    instagram: a.instagram,
    contract: {
      start: dayOf(creator.contractStart),
      end: dayOf(creator.contractEnd),
      ...contractStatus(dayOf(creator.contractEnd), new Date()),
      contractSigned: creator.contractSigned,
      couponRegistered: creator.couponRegistered,
      followsOnInstagram: creator.followsOnInstagram,
      inGroup: creator.inGroup,
      tagged: creator.tagged,
      note: creator.checklistNote,
    },
    ugc: creator.ugcFolderUrl || creator.ugcVideoStatus || creator.ugcOrder
      ? { folderUrl: creator.ugcFolderUrl, videoStatus: creator.ugcVideoStatus, order: creator.ugcOrder }
      : null,
    notes: creator.notes,
    coupons: assignments.map((x) => ({
      code: x.coupon.code,
      kind: x.coupon.kind,
      since: x.validFrom,
      until: x.validTo,
      confirmed: x.confirmedAt !== null,
    })),
    policies: policies.map((p) => ({ rateBps: p.rateBps, since: p.validFrom, until: p.validTo, confirmed: p.confirmedAt !== null })),
    invites: invites.map((i) => ({ createdAt: i.createdAt, expiresAt: i.expiresAt, acceptedAt: i.acceptedAt, revokedAt: i.revokedAt })),
  };
}

export async function updateContact(
  prisma: PrismaClient,
  actor: Actor | null,
  creatorId: string,
  input: { name: string; email: string; phone: string },
) {
  const creator = await loadCreator(prisma, creatorId);
  if (!actor || !can(actor.grants, "creators.edit", creator.brandId)) throw new ProfileError("Sem permissão.");
  const name = input.name.trim();
  const email = normalizeEmail(input.email);
  const phone = input.phone.trim() || null;
  if (!name) throw new ProfileError("Informe o nome.");
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new ProfileError("E-mail inválido.");
  if (email.endsWith(FAKE_EMAIL_DOMAIN)) throw new ProfileError("Use o e-mail real da creator.");
  const a = creator.account;
  if (email !== a.email && a.userId) {
    throw new ProfileError("Esta creator já entrou no portal; a troca de e-mail de login fica para depois.");
  }
  if (email !== a.email && (await prisma.creatorAccount.findUnique({ where: { email } }))) {
    throw new ProfileError("Este e-mail já é de outra creator.");
  }
  await prisma.$transaction([
    prisma.creatorAccount.update({ where: { id: a.id }, data: { name, email, phone } }),
    audit(prisma, actor, creator.brandId, "creator.contact", "CreatorAccount", a.id, { name: a.name, email: a.email, phone: a.phone }, { name, email, phone }),
  ]);
}

export async function setCreatorStatus(prisma: PrismaClient, actor: Actor | null, creatorId: string, status: CreatorStatusValue) {
  const creator = await loadCreator(prisma, creatorId);
  if (!actor || !can(actor.grants, "creators.edit", creator.brandId)) throw new ProfileError("Sem permissão.");
  if (!(status in STATUS_LABEL)) throw new ProfileError("Situação inválida.");
  if (creator.status === status) return;
  const now = new Date();
  await prisma.$transaction([
    prisma.creator.update({
      where: { id: creatorId },
      data: {
        status,
        ...(status === "ACTIVE" ? { activatedAt: creator.activatedAt ?? now, deactivatedAt: null } : {}),
        ...(status === "DEACTIVATED" ? { deactivatedAt: now } : {}),
      },
    }),
    audit(prisma, actor, creator.brandId, "creator.status", "Creator", creatorId, { status: creator.status }, { status }),
  ]);
}

/**
 * Muda a taxa já confirmada (D-RATECHG): a atual termina agora e a nova vale para pedidos pagos daqui em diante.
 * Taxa ainda "a confirmar" se resolve na conferência (/admin/cupons), não aqui.
 */
export async function changeRate(prisma: PrismaClient, actor: Actor | null, creatorId: string, rateBps: number, now = new Date()) {
  const creator = await loadCreator(prisma, creatorId);
  if (!actor || !can(actor.grants, "creators.edit", creator.brandId)) throw new ProfileError("Sem permissão.");
  try {
    assertBps(rateBps);
  } catch {
    throw new ProfileError("Taxa inválida.");
  }
  const current = await prisma.commissionPolicy.findFirst({ where: { creatorId, validTo: null } });
  if (!current) throw new ProfileError("Creator sem taxa vigente.");
  if (!current.confirmedAt) throw new ProfileError("Confirme a taxa atual na conferência antes de mudar.");
  if (current.rateBps === rateBps) return;
  if (current.validFrom >= now) throw new ProfileError("A taxa atual começou agora; tente de novo em instantes.");
  await prisma.$transaction(async (tx) => {
    await tx.commissionPolicy.update({ where: { id: current.id }, data: { validTo: now } });
    const created = await tx.commissionPolicy.create({
      data: { brandId: creator.brandId, creatorId, rateBps, validFrom: now, createdById: actor.userId, confirmedAt: now, confirmedById: actor.userId },
    });
    await tx.auditLog.create({
      data: {
        brandId: creator.brandId,
        actorType: "USER",
        actorId: actor.userId,
        action: "commission.change",
        entity: "CommissionPolicy",
        entityId: created.id,
        before: { rateBps: current.rateBps },
        after: { rateBps, validFrom: now.toISOString() },
      },
    });
  });
}
