import type { PrismaClient } from "@/generated/prisma/client";
import { assertBps, contractStatus, creatorPendings, dayKey, socialHandle, type CreatorCategoryValue } from "@/domain";
import { dayOf } from "./contract";
import { idleFor } from "./idle";
import { lastOrderFor } from "./last-order";
import { addressOf, formatAddress } from "@/lib/shipments/address";
import { informedAddressFor } from "@/lib/shipments/shipments";
import { ugcCyclesFor, ugcVideosOf } from "./ugc";
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
  const [creators, brand] = await Promise.all([
    prisma.creator.findMany({
      where: { brandId },
      orderBy: { account: { name: "asc" } },
      include: {
        account: { select: { name: true, email: true, userId: true, phone: true, instagram: true, tiktok: true, cpf: true } },
        contractTemplate: { select: { releaseMinCents: true } },
        couponAssignments: { where: { validTo: null }, select: { confirmedAt: true, coupon: { select: { code: true, kind: true } } } },
        commissionPolicies: { where: { validTo: null }, select: { confirmedAt: true } },
      },
    }),
    prisma.brand.findUniqueOrThrow({ where: { id: brandId }, select: { timezone: true } }),
  ]);
  const money = can(actor.grants, "money.view", brandId);
  const fiscal = can(actor.grants, "personal.fiscal", brandId);
  const [idle, ugc, lastOrders, sales] = await Promise.all([
    idleFor(prisma, creators, brand.timezone),
    ugcCyclesFor(prisma, creators, brand.timezone),
    lastOrderFor(prisma, creators.map((c) => c.id)),
    // Lista no modelo da referência (M0.0.2): vendas de cada creator (pagas, pela régua da comissão), só para quem vê dinheiro.
    money
      ? prisma.order.findMany({
          where: { brandId, cancelledAt: null, test: false, financialStatus: { in: ["PAID", "PARTIALLY_REFUNDED"] }, attribution: { isNot: null } },
          select: { subtotalCents: true, paidAt: true, attribution: { select: { creatorId: true } } },
        })
      : Promise.resolve([]),
  ]);
  const since30 = Date.now() - 30 * 86_400_000;
  const stats = new Map<string, { salesCents: number; orders: number; sales30Cents: number; lastPaidAt: Date | null }>();
  for (const o of sales) {
    const id = o.attribution!.creatorId;
    const st = stats.get(id) ?? { salesCents: 0, orders: 0, sales30Cents: 0, lastPaidAt: null };
    st.salesCents += o.subtotalCents;
    st.orders++;
    if (o.paidAt && o.paidAt.getTime() >= since30) st.sales30Cents += o.subtotalCents;
    if (o.paidAt && (!st.lastPaidAt || o.paidAt > st.lastPaidAt)) st.lastPaidAt = o.paidAt;
    stats.set(id, st);
  }
  return creators.map((c) => {
    const fakeEmail = c.account.email.endsWith(FAKE_EMAIL_DOMAIN);
    const contract = contractStatus(dayOf(c.contractEnd), new Date());
    const last = lastOrders.get(c.id);
    return {
      id: c.id,
      name: c.account.name,
      status: c.status as CreatorStatusValue,
      categories: c.categories as CreatorCategoryValue[],
      fakeEmail,
      hasLogin: c.account.userId !== null,
      reviewed: c.reviewedAt !== null,
      contract,
      idle: idle.get(c.id) ?? null,
      ugcCycle: ugc.get(c.id) ?? null,
      // Última venda: a mais recente entre o pedido do cupom (D-LASTORDER) e as vendas atribuídas.
      lastOrder: (() => {
        const st = stats.get(c.id);
        if (st?.lastPaidAt && (!last || st.lastPaidAt > last.paidAt)) return { name: "", day: dayKey(st.lastPaidAt, brand.timezone) };
        return last ? { name: last.name, day: dayKey(last.paidAt, brand.timezone) } : null;
      })(),
      joinedAt: c.createdAt,
      email: fakeEmail ? null : c.account.email,
      phone: c.account.phone,
      instagram: c.account.instagram,
      tiktok: c.account.tiktok,
      cpf: fiscal ? (c.account.cpf ?? null) : null,
      coupon: c.couponAssignments.find((a) => a.coupon.kind === "CREATOR")?.coupon.code ?? c.couponAssignments[0]?.coupon.code ?? null,
      stats: money ? (({ lastPaidAt: _, ...v }) => v)(stats.get(c.id) ?? { salesCents: 0, orders: 0, sales30Cents: 0, lastPaidAt: null }) : null,
      pendings: creatorPendings({
        status: c.status,
        reviewed: c.reviewedAt !== null,
        ownerPending: c.couponAssignments.some((a) => a.confirmedAt === null),
        ratePending: c.commissionPolicies.some((p) => p.confirmedAt === null),
        fakeEmail,
        contract: contract.status,
      }),
    };
  });
}

export async function creatorProfile(prisma: PrismaClient, actor: Actor | null, creatorId: string) {
  const creator = await loadCreator(prisma, creatorId);
  if (!actor || !can(actor.grants, "creators.view", creator.brandId)) throw new ProfileError("Sem permissão.");
  const [template, brand] = await Promise.all([
    creator.contractTemplateId
      ? prisma.contractTemplate.findUnique({ where: { id: creator.contractTemplateId }, select: { releaseMinCents: true } })
      : Promise.resolve(null),
    prisma.brand.findUniqueOrThrow({ where: { id: creator.brandId }, select: { timezone: true } }),
  ]);
  const [idleMap, ugcMap, ugcVideos] = await Promise.all([
    idleFor(prisma, [{ ...creator, contractTemplate: template }], brand.timezone),
    ugcCyclesFor(prisma, [creator], brand.timezone),
    ugcVideosOf(prisma, creator.id),
  ]);
  const idle = idleMap.get(creator.id) ?? null;
  const ugcCycle = ugcMap.get(creator.id) ?? null;
  const fiscal = can(actor.grants, "personal.fiscal", creator.brandId);
  const seeAddress = can(actor.grants, "personal.address", creator.brandId);
  const full = addressOf(creator.account);
  // D-ADDRINFORMED: sem endereço completo, mostra o que já está no sistema em texto (carga, inscrição, contrato, envio).
  const address = !seeAddress ? null : full ? { lines: formatAddress(full), confirmed: true } : await informedAddressFor(prisma, creator.id).then((t) => (t ? { lines: [t], confirmed: false } : { lines: [], confirmed: false }));
  const money = can(actor.grants, "money.view", creator.brandId);
  const [assignments, policies, invites, adjustments, templates] = await Promise.all([
    prisma.couponAssignment.findMany({ where: { creatorId }, orderBy: { validFrom: "desc" }, include: { coupon: true } }),
    prisma.commissionPolicy.findMany({ where: { creatorId }, orderBy: { validFrom: "desc" } }),
    prisma.creatorInvite.findMany({ where: { accountId: creator.accountId }, orderBy: { createdAt: "desc" }, take: 3 }),
    money
      ? prisma.ledgerEntry.findMany({ where: { creatorId, type: "ADJUSTMENT" }, orderBy: { createdAt: "desc" }, take: 20 })
      : Promise.resolve([]),
    prisma.contractTemplate.findMany({ where: { brandId: creator.brandId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
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
    address,
    hasLogin: a.userId !== null,
    reviewedAt: creator.reviewedAt,
    withdrawalsUnlocked: creator.withdrawalsUnlockedAt !== null,
    categories: creator.categories,
    instagram: a.instagram,
    tiktok: a.tiktok,
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
      templateId: creator.contractTemplateId,
      receivesAsIndividual: creator.receivesAsIndividual,
    },
    idle,
    contractTemplates: templates,
    ugc: creator.ugcFolderUrl || creator.ugcVideoStatus || creator.ugcOrder
      ? { folderUrl: creator.ugcFolderUrl, videoStatus: creator.ugcVideoStatus, order: creator.ugcOrder }
      : null,
    ugcCycle,
    ugcVideos: ugcCycle ? ugcVideos : [],
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
  input: { name: string; email: string; phone: string; instagram?: string; tiktok?: string },
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
  // Redes: só mudam quando o formulário as envia (vazio apaga). Gravadas sem @ e sem o endereço do site.
  const instagram = input.instagram === undefined ? a.instagram : socialHandle(input.instagram) || null;
  const tiktok = input.tiktok === undefined ? a.tiktok : socialHandle(input.tiktok) || null;
  await prisma.$transaction([
    prisma.creatorAccount.update({ where: { id: a.id }, data: { name, email, phone, instagram, tiktok } }),
    audit(
      prisma, actor, creator.brandId, "creator.contact", "CreatorAccount", a.id,
      { name: a.name, email: a.email, phone: a.phone, instagram: a.instagram, tiktok: a.tiktok },
      { name, email, phone, instagram, tiktok },
    ),
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
