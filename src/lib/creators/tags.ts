import type { PrismaClient } from "@/generated/prisma/client";
import { tagName } from "@/domain";
import type { Actor } from "@/lib/auth/actor";
import { can } from "@/lib/auth/permissions";

/**
 * Tags das creators (M4.2, D-TAGS). Tags são livres, da marca: a Gestão (quem edita creators)
 * cria ao marcar ("fitness", "mãe"…) e tira da creator quando quiser; só a equipe vê. A tag fica na marca para as
 * próximas (lista de sugestões). Cada marcação e retirada vai para a auditoria.
 */

export class TagError extends Error {}

/** Tags da marca, com quantas creators têm cada uma (para sugestões e filtro). */
export async function brandTags(prisma: PrismaClient, brandId: string) {
  const tags = await prisma.creatorTag.findMany({ where: { brandId }, select: { id: true, name: true, _count: { select: { links: true } } } });
  return tags.map((t) => ({ id: t.id, name: t.name, count: t._count.links })).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

async function editable(prisma: PrismaClient, actor: Actor | null, creatorId: string) {
  const creator = await prisma.creator.findUnique({ where: { id: creatorId }, select: { id: true, brandId: true } });
  if (!creator) throw new TagError("Creator não encontrada.");
  if (!actor || !can(actor.grants, "creators.edit", creator.brandId)) throw new TagError("Sem permissão.");
  return { creator, actor };
}

/** Marca a tag na creator (cria a tag na marca se ainda não existe; mesmo nome sem acento/maiúscula = mesma tag). */
export async function addCreatorTag(prisma: PrismaClient, actor: Actor | null, creatorId: string, raw: string) {
  const { creator, actor: who } = await editable(prisma, actor, creatorId);
  const t = tagName(raw);
  if (!t) throw new TagError("Escreva o nome da tag.");
  return prisma.$transaction(async (tx) => {
    const tag = await tx.creatorTag.upsert({
      where: { brandId_key: { brandId: creator.brandId, key: t.key } },
      update: {},
      create: { brandId: creator.brandId, name: t.name, key: t.key, createdById: who.userId },
      select: { id: true, name: true },
    });
    const { count } = await tx.creatorTagLink.createMany({ data: [{ creatorId, tagId: tag.id, brandId: creator.brandId, createdById: who.userId }], skipDuplicates: true });
    if (count) {
      await tx.auditLog.create({ data: { brandId: creator.brandId, actorType: "USER", actorId: who.userId, action: "creator.tag.add", entity: "Creator", entityId: creatorId, after: { tag: tag.name } } });
    }
    return tag;
  });
}

/** Tira a tag da creator (a tag continua na marca). */
export async function removeCreatorTag(prisma: PrismaClient, actor: Actor | null, creatorId: string, tagId: string) {
  const { creator, actor: who } = await editable(prisma, actor, creatorId);
  await prisma.$transaction(async (tx) => {
    const link = await tx.creatorTagLink.findUnique({ where: { creatorId_tagId: { creatorId, tagId } }, select: { tag: { select: { name: true } } } });
    if (!link) return;
    await tx.creatorTagLink.delete({ where: { creatorId_tagId: { creatorId, tagId } } });
    await tx.auditLog.create({ data: { brandId: creator.brandId, actorType: "USER", actorId: who.userId, action: "creator.tag.remove", entity: "Creator", entityId: creatorId, before: { tag: link.tag.name } } });
  });
}
