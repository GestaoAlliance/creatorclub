import { FAKE_EMAIL_DOMAIN } from "@/lib/import/legacy";
import type { PrismaClient } from "@/generated/prisma/client";
import type { Actor } from "@/lib/auth/actor";
import { portalInviteMessage, whatsappLink } from "@/domain";
import { brandsWith, can } from "@/lib/auth/permissions";
import type { EmailSender } from "@/lib/email/sender";
import { emailCreatorInvite } from "./invite-email";
import { normalizeEmail } from "@/lib/auth/rules";
import { TeamError } from "./invites";
import { hashInviteToken, INVITE_TTL_DAYS, newInviteToken } from "./tokens";

/**
 * Convite da creator (E2.5): ligado à conta (`CreatorAccount`), não a um e-mail solto. Quem pode editar a creator
 * em ao menos uma das marcas dela pode convidar. Conta já com login não recebe convite.
 */
export async function createCreatorInvite(prisma: PrismaClient, actor: Actor | null, accountId: string, now = new Date()) {
  if (!actor) throw new TeamError("Sem permissão.");
  const account = await prisma.creatorAccount.findUnique({
    where: { id: accountId },
    select: { id: true, email: true, userId: true, creators: { select: { brandId: true } } },
  });
  if (!account) throw new TeamError("Creator não encontrada.");
  const allowed = brandsWith(actor.grants, "creators.edit");
  const canInvite = allowed === "ALL" || account.creators.some((c) => allowed.includes(c.brandId));
  if (!canInvite) throw new TeamError("Sem permissão.");
  if (account.userId) throw new TeamError("Esta creator já tem acesso ao portal.");
  if (!normalizeEmail(account.email) || account.email.endsWith(FAKE_EMAIL_DOMAIN)) {
    throw new TeamError("Confirme o e-mail da creator antes de convidar.");
  }

  const { token, tokenHash } = newInviteToken();
  const expiresAt = new Date(now.getTime() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
  const invite = await prisma.$transaction(async (tx) => {
    const created = await tx.creatorInvite.create({
      data: { accountId, tokenHash, expiresAt, createdById: actor.userId },
    });
    await tx.auditLog.create({
      data: {
        actorType: "USER",
        actorId: actor.userId,
        action: "creator_invite.create",
        entity: "CreatorAccount",
        entityId: accountId,
        after: { inviteId: created.id, expiresAt: expiresAt.toISOString() },
      },
    });
    return created;
  });
  return { token, invite };
}

export async function creatorInviteByToken(prisma: PrismaClient, token: string, now = new Date()) {
  const invite = await prisma.creatorInvite.findUnique({
    where: { tokenHash: hashInviteToken(token) },
    include: {
      account: {
        select: { name: true, email: true, userId: true, creators: { select: { brand: { select: { name: true } } } } },
      },
    },
  });
  let state: "valid" | "invalid" | "expired" | "used" | "revoked" = "valid";
  if (!invite) state = "invalid";
  else if (invite.revokedAt) state = "revoked";
  else if (invite.acceptedAt || invite.account.userId) state = "used";
  else if (invite.expiresAt <= now) state = "expired";
  return { invite, state };
}

/** Aceita: uso único (atômico), e-mail da sessão = e-mail da conta, liga a conta ao login. */
export async function acceptCreatorInvite(
  prisma: PrismaClient,
  token: string,
  auth: { userId: string; email: string },
  now = new Date(),
) {
  const tokenHash = hashInviteToken(token);
  return prisma.$transaction(async (tx) => {
    const invite = await tx.creatorInvite.findUnique({ where: { tokenHash }, include: { account: true } });
    if (!invite) throw new TeamError("Convite inválido.");
    if (normalizeEmail(auth.email) !== normalizeEmail(invite.account.email)) {
      throw new TeamError("Este convite é para outro e-mail.");
    }
    const claimed = await tx.creatorInvite.updateMany({
      where: { id: invite.id, acceptedAt: null, revokedAt: null, expiresAt: { gt: now } },
      data: { acceptedAt: now, acceptedUserId: auth.userId },
    });
    if (claimed.count !== 1) throw new TeamError("Convite expirado, cancelado ou já usado.");

    const user = await tx.user.findUnique({ where: { id: auth.userId } });
    if (!user) {
      await tx.user.create({
        data: { id: auth.userId, email: normalizeEmail(invite.account.email)!, name: invite.account.name },
      });
    }
    const linked = await tx.creatorAccount.updateMany({
      where: { id: invite.accountId, userId: null },
      data: { userId: auth.userId },
    });
    if (linked.count !== 1) throw new TeamError("Esta creator já tem acesso ao portal.");
    await tx.auditLog.create({
      data: {
        actorType: "USER",
        actorId: auth.userId,
        action: "creator_invite.accept",
        entity: "CreatorAccount",
        entityId: invite.accountId,
        after: { inviteId: invite.id },
      },
    });
    return { accountId: invite.accountId };
  });
}

export const BULK_INVITE_MAX = 50;

export type BulkInviteResult = { creatorId: string; name: string; link: string | null; message: string | null; whatsappUrl: string | null; emailedTo: string | null; error: string | null };

/**
 * Convites em massa (D-ACCESSREQ): na lista de creators, filtro "sem acesso ao portal", a Gestão marca as creators e
 * gera os links de uma vez, cada um com a mensagem pronta para o WhatsApp (e o e-mail, quando houver remetente).
 * Quem já tem login ou está com e-mail provisório fica de fora, com o motivo.
 */
export async function inviteCreatorsInBulk(
  prisma: PrismaClient,
  actor: Actor | null,
  brandId: string,
  creatorIds: string[],
  deps: { origin: string; email: EmailSender | null },
  now = new Date(),
): Promise<BulkInviteResult[]> {
  if (!actor || !can(actor.grants, "creators.edit", brandId)) throw new TeamError("Sem permissão.");
  const ids = [...new Set(creatorIds)];
  if (ids.length === 0) throw new TeamError("Marque pelo menos uma creator.");
  if (ids.length > BULK_INVITE_MAX) throw new TeamError(`No máximo ${BULK_INVITE_MAX} convites de uma vez.`);
  const creators = await prisma.creator.findMany({
    where: { id: { in: ids }, brandId },
    select: { id: true, brand: { select: { name: true } }, account: { select: { id: true, name: true, email: true, phone: true, userId: true } } },
    orderBy: { account: { name: "asc" } },
  });
  const out: BulkInviteResult[] = [];
  for (const c of creators) {
    const base = { creatorId: c.id, name: c.account.name, link: null, message: null, whatsappUrl: null, emailedTo: null };
    try {
      const { token, invite } = await createCreatorInvite(prisma, actor, c.account.id, now);
      const link = `${deps.origin}/convite/${token}`;
      const message = portalInviteMessage({ name: c.account.name, brand: c.brand.name, link, until: invite.expiresAt });
      const mail = await emailCreatorInvite(prisma, deps.email, { inviteId: invite.id, actorId: actor.userId, link }, now);
      out.push({ ...base, link, message, whatsappUrl: whatsappLink(c.account.phone, message), emailedTo: mail?.sent ? mail.to : null, error: null });
    } catch (error) {
      if (!(error instanceof TeamError)) throw error;
      out.push({ ...base, error: error.message });
    }
  }
  return out;
}
