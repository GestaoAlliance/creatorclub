import type { PrismaClient } from "@/generated/prisma/client";
import type { Actor } from "@/lib/auth/actor";
import { brandsWith } from "@/lib/auth/permissions";
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
  if (!normalizeEmail(account.email)) throw new TeamError("Confirme o e-mail da creator antes de convidar.");

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
