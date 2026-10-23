import type { PrismaClient } from "@/generated/prisma/client";
import { dayKey, parseBirthDate, socialHandle } from "@/domain";
import type { PortalContext } from "./context";

/**
 * A creator informa o próprio TikTok no portal (CP-150): quem entrou antes do cadastro novo não tinha o campo.
 * Gravado sem @ e sem o endereço do site, como no cadastro; a equipe vê e corrige na ficha.
 */
export class SocialError extends Error {}

export async function updateMyTiktok(prisma: PrismaClient, ctx: PortalContext, actorUserId: string, raw: string): Promise<string> {
  if (ctx.viewAs) throw new SocialError("Visualização da equipe: nada é alterado em nome da creator.");
  const tiktok = socialHandle(raw);
  if (!/^[A-Za-z0-9._]{2,30}$/.test(tiktok)) throw new SocialError("Informe o seu @ do TikTok (letras, números, ponto ou _).");
  const creator = await prisma.creator.findUniqueOrThrow({ where: { id: ctx.creatorId }, select: { accountId: true, brandId: true, account: { select: { tiktok: true } } } });
  await prisma.$transaction([
    prisma.creatorAccount.update({ where: { id: creator.accountId }, data: { tiktok } }),
    prisma.auditLog.create({
      data: { brandId: creator.brandId, actorType: "USER", actorId: actorUserId, action: "creator.tiktok", entity: "CreatorAccount", entityId: creator.accountId, before: { tiktok: creator.account.tiktok }, after: { tiktok } },
    }),
  ]);
  return tiktok;
}

/**
 * A creator informa o próprio aniversário no portal (M4.2, D-TAGS): só enquanto não há data; depois quem corrige é a
 * equipe, na ficha. Na visualização da equipe nada muda.
 */
export async function setMyBirthDate(prisma: PrismaClient, ctx: PortalContext, actorUserId: string, raw: string, now = new Date()): Promise<void> {
  if (ctx.viewAs) throw new SocialError("Visualização da equipe: nada é alterado em nome da creator.");
  const b = parseBirthDate(raw, dayKey(now, "America/Sao_Paulo"));
  if (!b.ok) throw new SocialError(b.error);
  if (!b.day) throw new SocialError("Informe a data.");
  const creator = await prisma.creator.findUniqueOrThrow({ where: { id: ctx.creatorId }, select: { accountId: true, brandId: true } });
  await prisma.$transaction(async (tx) => {
    const { count } = await tx.creatorAccount.updateMany({ where: { id: creator.accountId, birthDate: null }, data: { birthDate: new Date(`${b.day}T00:00:00Z`) } });
    if (!count) throw new SocialError("A data já foi informada. Para corrigir, fale com a equipe.");
    await tx.auditLog.create({
      data: { brandId: creator.brandId, actorType: "USER", actorId: actorUserId, action: "creator.birthdate", entity: "CreatorAccount", entityId: creator.accountId, after: { birthDate: b.day } },
    });
  });
}
