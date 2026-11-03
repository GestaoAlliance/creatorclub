import { randomInt } from "node:crypto";
import type { PrismaClient } from "@/generated/prisma/client";
import { passwordResetEmail } from "@/domain";
import { EmailError, type EmailSender } from "@/lib/email/sender";
import type { Actor } from "./actor";
import { brandsWith, can } from "./permissions";

/**
 * Acesso (M4.4b, D-ACCESS): último acesso e nova senha pedida pela equipe.
 * - Último acesso: gravado pelo próprio sistema a cada requisição com login, no máximo uma vez por hora.
 * - Nova senha: link de uso único (o Supabase gera; vence em 1 hora) para mandar pelo WhatsApp, ou o mesmo link por
 *   e-mail. Senha de creator: Gestão (da marca dela) e super admin; senha de alguém da equipe: só super admin.
 *   Ninguém vê senha; tudo na auditoria.
 */

export class AccessError extends Error {}

const HOUR = 3_600_000;

export async function touchLastSeen(prisma: PrismaClient, userId: string, now = new Date()) {
  await prisma.user.updateMany({ where: { id: userId, OR: [{ lastSeenAt: null }, { lastSeenAt: { lt: new Date(now.getTime() - HOUR) } }] }, data: { lastSeenAt: now } });
}

/** D-ACCESSFIX: troca a senha ou o e-mail de login no Supabase (trocado nos testes). */
export type AuthAdmin = { setPassword(userId: string, password: string): Promise<void>; setEmail(userId: string, email: string): Promise<void> };

/** Senha provisória fácil de ditar: sem letras e números que se confundem (l/1, o/0). */
export function temporaryPassword(size = 10): string {
  const abc = "abcdefghjkmnpqrstuvwxyz23456789";
  return Array.from({ length: size }, () => abc[randomInt(abc.length)]).join("");
}

/** Gera o código de nova senha de um e-mail (no Supabase; trocado nos testes). */
export type RecoveryTokenMaker = (email: string) => Promise<string>;

async function target(prisma: PrismaClient, actor: Actor | null, userId: string) {
  if (!actor) throw new AccessError("Sem permissão.");
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, disabledAt: true, roleGrants: { select: { id: true } }, creatorAccount: { select: { creators: { select: { brandId: true, brand: { select: { name: true, slug: true } } } } } } },
  });
  if (!user || user.disabledAt) throw new AccessError("Pessoa não encontrada.");
  if (user.id === actor.userId) throw new AccessError("Para trocar a sua própria senha, use \"Esqueci a senha\" na tela de entrar.");
  const superAdmin = brandsWith(actor.grants, "staff.manage") === "ALL";
  const creators = user.creatorAccount?.creators ?? [];
  const staff = user.roleGrants.length > 0;
  // Quem é da equipe só o super admin; creator, quem edita creators numa marca dela.
  const allowed = staff ? superAdmin : creators.some((c) => can(actor.grants, "creators.edit", c.brandId));
  if (!allowed) throw new AccessError("Sem permissão.");
  const brand = creators.find((c) => can(actor.grants, "creators.edit", c.brandId)) ?? creators[0];
  return { user, brandId: brand?.brandId ?? null, brandName: brand?.brand.name ?? "Alliance", brand: brand?.brand ?? null };
}

/** Link de nova senha (uso único, 1 hora) para a equipe mandar pelo WhatsApp. */
export async function passwordResetLink(prisma: PrismaClient, actor: Actor | null, userId: string, origin: string, makeToken: RecoveryTokenMaker): Promise<string> {
  const t = await target(prisma, actor, userId);
  const token = await makeToken(t.user.email);
  await prisma.auditLog.create({ data: { brandId: t.brandId, actorType: "USER", actorId: actor!.userId, action: "password.reset_link", entity: "User", entityId: userId } });
  return `${origin}/auth/confirm?token_hash=${encodeURIComponent(token)}&type=recovery&next=/entrar/nova-senha`;
}

/** O mesmo link, mandado para o e-mail da pessoa. */
export async function emailPasswordReset(prisma: PrismaClient, actor: Actor | null, userId: string, origin: string, makeToken: RecoveryTokenMaker, sender: EmailSender | null): Promise<string> {
  if (!sender) throw new AccessError("O envio de e-mail não está configurado. Use \"Gerar link\" e mande pelo WhatsApp.");
  const t = await target(prisma, actor, userId);
  const token = await makeToken(t.user.email);
  const link = `${origin}/auth/confirm?token_hash=${encodeURIComponent(token)}&type=recovery&next=/entrar/nova-senha`;
  try {
    await sender({ ...passwordResetEmail({ name: t.user.name, brandName: t.brandName, link }), to: t.user.email, brand: t.brand });
  } catch (error) {
    if (error instanceof EmailError) throw new AccessError(`Não foi possível mandar o e-mail: ${error.message}`);
    throw error;
  }
  await prisma.auditLog.create({ data: { brandId: t.brandId, actorType: "USER", actorId: actor!.userId, action: "password.reset_email", entity: "User", entityId: userId } });
  return t.user.email;
}

/**
 * D-ACCESSFIX: senha provisória criada pela equipe (Gestão da marca da creator, ou super admin). Aparece uma vez para
 * mandar pelo WhatsApp; no primeiro acesso o portal leva para criar a própria senha.
 */
export async function setTemporaryPassword(prisma: PrismaClient, actor: Actor | null, userId: string, admin: AuthAdmin, make = temporaryPassword) {
  const t = await target(prisma, actor, userId);
  const password = make();
  await admin.setPassword(t.user.id, password);
  await prisma.$transaction([
    prisma.user.update({ where: { id: t.user.id }, data: { mustChangePassword: true } }),
    prisma.auditLog.create({ data: { brandId: t.brandId, actorType: "USER", actorId: actor!.userId, action: "password.temporary", entity: "User", entityId: t.user.id } }),
  ]);
  return { password, email: t.user.email };
}

/**
 * D-ACCESSFIX: corrige o e-mail de login (ex.: erro de digitação no cadastro). Muda o login e o e-mail do cadastro
 * juntos; a senha continua a mesma. Só quem edita todas as marcas da creator (o login é um só para todas).
 */
export async function changeLoginEmail(prisma: PrismaClient, actor: Actor | null, userId: string, rawEmail: string, admin: AuthAdmin) {
  const t = await target(prisma, actor, userId);
  const email = rawEmail.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 200) throw new AccessError("E-mail inválido.");
  if (email === t.user.email) throw new AccessError("Esse já é o e-mail de login.");
  const brands = t.user.creatorAccount?.creators ?? [];
  if (brands.some((c) => !can(actor!.grants, "creators.edit", c.brandId))) throw new AccessError("Ela também é creator de outra marca que você não acessa. Peça a um super admin.");
  const [user, account] = await Promise.all([
    prisma.user.findUnique({ where: { email }, select: { id: true } }),
    prisma.creatorAccount.findUnique({ where: { email }, select: { userId: true } }),
  ]);
  if ((user && user.id !== t.user.id) || (account && account.userId !== t.user.id)) throw new AccessError("Esse e-mail já é de outra pessoa no Creator Club.");
  await admin.setEmail(t.user.id, email);
  await prisma.$transaction([
    prisma.user.update({ where: { id: t.user.id }, data: { email } }),
    prisma.creatorAccount.updateMany({ where: { userId: t.user.id }, data: { email } }),
    prisma.auditLog.create({ data: { brandId: t.brandId, actorType: "USER", actorId: actor!.userId, action: "user.login_email", entity: "User", entityId: t.user.id, before: { email: t.user.email }, after: { email } } }),
  ]);
  return email;
}

/** D-ACCESSFIX: entrou com senha provisória e ainda não criou a própria? */
export async function mustChangePassword(prisma: PrismaClient, userId: string): Promise<boolean> {
  return (await prisma.user.findUnique({ where: { id: userId }, select: { mustChangePassword: true } }))?.mustChangePassword === true;
}
