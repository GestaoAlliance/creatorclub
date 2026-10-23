import type { PrismaClient } from "@/generated/prisma/client";
import type { Actor } from "@/lib/auth/actor";
import { brandsWith, type StaffRole } from "@/lib/auth/permissions";
import { normalizeEmail } from "@/lib/auth/rules";
import { hashInviteToken, INVITE_TTL_DAYS, newInviteToken } from "./tokens";

export class TeamError extends Error {}

const STAFF_ROLES: StaffRole[] = ["SUPER_ADMIN", "GESTAO", "ENVIO", "PAGAMENTO", "HUNTER"];

function requireStaffManager(actor: Actor | null): Actor {
  // Gestão da equipe é global: só SUPER_ADMIN (brandsWith = "ALL").
  if (!actor || brandsWith(actor.grants, "staff.manage") !== "ALL") throw new TeamError("Sem permissão.");
  return actor;
}

export type InviteInput = { email: unknown; name: unknown; role: unknown; brandId: unknown; extraBrandIds?: unknown[] };

/**
 * Cria um convite e devolve o token (mostrar o link uma vez; só o hash fica no banco). E-mail em branco = convite
 * aberto (D-OPENINVITE): quem abrir o link digita o próprio e-mail; nunca para super admin.
 */
export async function createStaffInvite(prisma: PrismaClient, actor: Actor | null, input: InviteInput, now = new Date()) {
  const manager = requireStaffManager(actor);
  const typed = typeof input.email === "string" ? input.email.trim() : "";
  const email = typed ? normalizeEmail(typed) : null;
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const role = STAFF_ROLES.find((r) => r === input.role);
  const brandId = typeof input.brandId === "string" && input.brandId ? input.brandId : null;
  if (typed && !email) throw new TeamError("E-mail inválido.");
  if (!name) throw new TeamError("Informe o nome.");
  if (!role) throw new TeamError("Papel inválido.");
  if (role === "SUPER_ADMIN" && brandId) throw new TeamError("Super admin vale para todas as marcas.");
  if (role === "SUPER_ADMIN" && !email) throw new TeamError("Convite de super admin precisa do e-mail.");
  if (role !== "SUPER_ADMIN" && !brandId) throw new TeamError("Escolha a marca.");
  if (brandId && !(await prisma.brand.findUnique({ where: { id: brandId }, select: { id: true } }))) {
    throw new TeamError("Marca não encontrada.");
  }
  // D-INVITEBRANDS: o mesmo papel em outras marcas, dado junto ao aceitar.
  const extra = [...new Set((input.extraBrandIds ?? []).filter((b): b is string => typeof b === "string" && b !== "" && b !== brandId))];
  if (extra.length && role === "SUPER_ADMIN") throw new TeamError("Super admin vale para todas as marcas.");
  if (extra.length && (await prisma.brand.count({ where: { id: { in: extra }, archivedAt: null } })) !== extra.length) {
    throw new TeamError("Marca não encontrada.");
  }

  const { token, tokenHash } = newInviteToken();
  const expiresAt = new Date(now.getTime() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
  const invite = await prisma.$transaction(async (tx) => {
    const created = await tx.staffInvite.create({
      data: { email, name, role, brandId, extraBrandIds: extra, tokenHash, expiresAt, createdById: manager.userId },
    });
    await tx.auditLog.create({
      data: {
        brandId,
        actorType: "USER",
        actorId: manager.userId,
        action: "invite.create",
        entity: "StaffInvite",
        entityId: created.id,
        after: { email: email ?? "(escolhido no primeiro acesso)", role, brandId, extraBrandIds: extra, expiresAt: expiresAt.toISOString() },
      },
    });
    return created;
  });
  return { token, invite };
}

export type InviteState = "valid" | "invalid" | "expired" | "used" | "revoked";

export async function inviteByToken(prisma: PrismaClient, token: string, now = new Date()) {
  const invite = await prisma.staffInvite.findUnique({
    where: { tokenHash: hashInviteToken(token) },
    include: { brand: { select: { name: true } } },
  });
  let state: InviteState = "valid";
  if (!invite) state = "invalid";
  else if (invite.revokedAt) state = "revoked";
  else if (invite.acceptedAt) state = "used";
  else if (invite.expiresAt <= now) state = "expired";
  return { invite, state };
}

/**
 * Aceita o convite para o usuário do Auth já autenticado. Uso único (a marcação é atômica), e-mail da conta
 * precisa ser o do convite (convite aberto, D-OPENINVITE: qualquer e-mail, o da conta). Cria o `User` (id = id do Auth) se não existir e concede o papel.
 */
export async function acceptStaffInvite(
  prisma: PrismaClient,
  token: string,
  auth: { userId: string; email: string },
  now = new Date(),
) {
  const tokenHash = hashInviteToken(token);
  return prisma.$transaction(async (tx) => {
    const invite = await tx.staffInvite.findUnique({ where: { tokenHash } });
    if (!invite) throw new TeamError("Convite inválido.");
    const accountEmail = normalizeEmail(auth.email);
    if (!accountEmail) throw new TeamError("E-mail inválido.");
    if (invite.email && accountEmail !== invite.email) throw new TeamError("Este convite é para outro e-mail.");
    const claimed = await tx.staffInvite.updateMany({
      where: { id: invite.id, acceptedAt: null, revokedAt: null, expiresAt: { gt: now } },
      data: { acceptedAt: now, acceptedUserId: auth.userId },
    });
    if (claimed.count !== 1) throw new TeamError("Convite expirado, cancelado ou já usado.");

    const existing = await tx.user.findUnique({ where: { id: auth.userId } });
    if (!existing) {
      await tx.user.create({ data: { id: auth.userId, email: accountEmail, name: invite.name } });
    } else if (existing.disabledAt) {
      await tx.user.update({ where: { id: auth.userId }, data: { disabledAt: null } });
    }
    for (const brandId of [invite.brandId, ...invite.extraBrandIds]) {
      const already = await tx.roleGrant.findFirst({ where: { userId: auth.userId, role: invite.role, brandId } });
      if (!already) await tx.roleGrant.create({ data: { userId: auth.userId, role: invite.role, brandId } });
    }
    await tx.auditLog.create({
      data: {
        brandId: invite.brandId,
        actorType: "USER",
        actorId: auth.userId,
        action: "invite.accept",
        entity: "StaffInvite",
        entityId: invite.id,
        after: { role: invite.role, brandId: invite.brandId, extraBrandIds: invite.extraBrandIds, ...(invite.email ? {} : { email: accountEmail, open: true }) },
      },
    });
    return { role: invite.role, brandId: invite.brandId };
  });
}

export async function revokeStaffInvite(prisma: PrismaClient, actor: Actor | null, inviteId: string, now = new Date()) {
  const manager = requireStaffManager(actor);
  await prisma.$transaction(async (tx) => {
    const done = await tx.staffInvite.updateMany({
      where: { id: inviteId, acceptedAt: null, revokedAt: null },
      data: { revokedAt: now },
    });
    if (done.count !== 1) throw new TeamError("Convite não está pendente.");
    await tx.auditLog.create({
      data: { actorType: "USER", actorId: manager.userId, action: "invite.revoke", entity: "StaffInvite", entityId: inviteId },
    });
  });
}

/** Tira um papel. Ninguém tira o próprio super admin, e sempre sobra ao menos um super admin. */
/** A1b (D-ALLIANCE): dá mais um papel a quem já está na equipe (ex.: Gestão também na VermeFree). */
export async function grantRole(prisma: PrismaClient, actor: Actor | null, input: { userId: string; role: unknown; brandId: unknown }) {
  const manager = requireStaffManager(actor);
  const role = STAFF_ROLES.find((r) => r === input.role);
  const brandId = typeof input.brandId === "string" && input.brandId ? input.brandId : null;
  if (!role) throw new TeamError("Papel inválido.");
  if (role === "SUPER_ADMIN" && brandId) throw new TeamError("Super admin vale para todas as marcas.");
  if (role !== "SUPER_ADMIN" && !brandId) throw new TeamError("Escolha a marca.");
  const user = await prisma.user.findUnique({ where: { id: input.userId }, select: { id: true, disabledAt: true } });
  if (!user || user.disabledAt) throw new TeamError("Pessoa não encontrada na equipe.");
  if (brandId && !(await prisma.brand.findUnique({ where: { id: brandId }, select: { id: true } }))) throw new TeamError("Marca não encontrada.");
  const exists = await prisma.roleGrant.findFirst({ where: { userId: user.id, role, brandId }, select: { id: true } });
  if (exists) throw new TeamError("Essa pessoa já tem esse papel nessa marca.");
  await prisma.$transaction(async (tx) => {
    await tx.roleGrant.create({ data: { userId: user.id, role, brandId } });
    await tx.auditLog.create({
      data: { brandId, actorType: "USER", actorId: manager.userId, action: "role.grant", entity: "User", entityId: user.id, after: { role, brandId } },
    });
  });
}

export async function revokeRoleGrant(prisma: PrismaClient, actor: Actor | null, grantId: string) {
  const manager = requireStaffManager(actor);
  await prisma.$transaction(async (tx) => {
    const grant = await tx.roleGrant.findUnique({ where: { id: grantId } });
    if (!grant) throw new TeamError("Papel não encontrado.");
    if (grant.role === "SUPER_ADMIN" && grant.brandId === null) {
      if (grant.userId === manager.userId) throw new TeamError("Você não pode tirar o seu próprio super admin.");
      const supers = await tx.roleGrant.count({
        where: { role: "SUPER_ADMIN", brandId: null, user: { disabledAt: null } },
      });
      if (supers <= 1) throw new TeamError("Precisa sobrar ao menos um super admin.");
    }
    await tx.roleGrant.delete({ where: { id: grantId } });
    await tx.auditLog.create({
      data: {
        brandId: grant.brandId,
        actorType: "USER",
        actorId: manager.userId,
        action: "role.revoke",
        entity: "User",
        entityId: grant.userId,
        before: { role: grant.role, brandId: grant.brandId },
      },
    });
  });
}

/** Remove a pessoa da equipe: desativa o acesso (não apaga). Mesmas proteções do super admin. */
export async function disableStaffUser(prisma: PrismaClient, actor: Actor | null, userId: string, now = new Date()) {
  const manager = requireStaffManager(actor);
  if (userId === manager.userId) throw new TeamError("Você não pode remover a si mesmo.");
  await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId }, include: { roleGrants: true } });
    if (!user || user.disabledAt) throw new TeamError("Pessoa não encontrada ou já removida.");
    if (user.roleGrants.some((g) => g.role === "SUPER_ADMIN" && g.brandId === null)) {
      const supers = await tx.roleGrant.count({
        where: { role: "SUPER_ADMIN", brandId: null, user: { disabledAt: null } },
      });
      if (supers <= 1) throw new TeamError("Precisa sobrar ao menos um super admin.");
    }
    await tx.user.update({ where: { id: userId }, data: { disabledAt: now } });
    await tx.auditLog.create({
      data: {
        actorType: "USER",
        actorId: manager.userId,
        action: "user.disable",
        entity: "User",
        entityId: userId,
        before: { grants: user.roleGrants.map((g) => ({ role: g.role, brandId: g.brandId })) },
      },
    });
  });
}

/** Para a tela da equipe: pessoas ativas com papéis, convites pendentes e marcas. */
export async function teamOverview(prisma: PrismaClient, actor: Actor | null, now = new Date()) {
  requireStaffManager(actor);
  const [users, invites, brands] = await Promise.all([
    prisma.user.findMany({
      where: { disabledAt: null, roleGrants: { some: {} } },
      select: { id: true, email: true, name: true, phone: true, lastSeenAt: true, roleGrants: { select: { id: true, role: true, brandId: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.staffInvite.findMany({
      where: { acceptedAt: null, revokedAt: null, expiresAt: { gt: now } },
      select: { id: true, email: true, name: true, role: true, brandId: true, extraBrandIds: true, expiresAt: true, emailedAt: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.brand.findMany({ where: { archivedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  return { users, invites, brands };
}


/**
 * WhatsApp de quem é da equipe (M3.4, D-WEEKLY): para onde vai o resumo semanal. Só celular do Brasil (com DDD);
 * vazio tira o número. Super admin muda; auditoria.
 */
export async function setStaffPhone(prisma: PrismaClient, actor: Actor | null, userId: string, raw: string) {
  const manager = requireStaffManager(actor);
  const digits = raw.replace(/\D/g, "").replace(/^0+/, "");
  const phone = digits ? (digits.length === 10 || digits.length === 11 ? `55${digits}` : digits) : null;
  if (phone && !/^55\d{10,11}$/.test(phone)) throw new TeamError("WhatsApp inválido: use DDD + número, ex.: (31) 99876-5432.");
  const before = await prisma.user.findUnique({ where: { id: userId }, select: { phone: true } });
  if (!before) throw new TeamError("Pessoa não encontrada.");
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { phone } }),
    prisma.auditLog.create({ data: { actorType: "USER", actorId: manager.userId, action: "staff.phone", entity: "User", entityId: userId, before, after: { phone } } }),
  ]);
}
