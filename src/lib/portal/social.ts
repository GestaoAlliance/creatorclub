import type { PrismaClient } from "@/generated/prisma/client";
import { socialHandle } from "@/domain";
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
