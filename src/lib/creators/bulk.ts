import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@/generated/prisma/client";
import { fillMessage, tagName, teamMessage, TEAM_MESSAGE_MAX } from "@/domain";
import type { Actor } from "@/lib/auth/actor";
import { can } from "@/lib/auth/permissions";
import { notify } from "@/lib/notifications/notify";

/**
 * Ações em grupo da lista de creators (D-CREATORLIST, D-BULKMSG): marcar várias e pôr/tirar uma tag ou mandar uma
 * mensagem de uma vez. Só quem edita creators da marca; só creators da própria marca (o resto é ignorado); cada ação vai
 * para a auditoria com quem fez e para quantas.
 */

export class BulkError extends Error {}

const MAX = 300;

async function own(prisma: PrismaClient, actor: Actor | null, brandId: string, ids: readonly string[]) {
  if (!actor || !can(actor.grants, "creators.edit", brandId)) throw new BulkError("Sem permissão.");
  const unique = [...new Set(ids)];
  if (!unique.length) throw new BulkError("Marque pelo menos uma creator.");
  if (unique.length > MAX) throw new BulkError(`No máximo ${MAX} creators de uma vez.`);
  const creators = await prisma.creator.findMany({
    where: { id: { in: unique }, brandId, archivedAt: null },
    select: { id: true, account: { select: { name: true } }, couponAssignments: { where: { validTo: null }, select: { coupon: { select: { code: true, kind: true } } } } },
  });
  if (!creators.length) throw new BulkError("Nenhuma das marcadas é desta marca.");
  return { actor, creators };
}

/** Põe a tag (cria na marca se não existe) ou tira de todas as marcadas. Devolve quantas mudaram. */
export async function bulkTag(prisma: PrismaClient, actor: Actor | null, brandId: string, ids: readonly string[], op: { add: string } | { remove: string }) {
  const { actor: who, creators } = await own(prisma, actor, brandId, ids);
  const creatorIds = creators.map((c) => c.id);
  return prisma.$transaction(async (tx) => {
    if ("add" in op) {
      const t = tagName(op.add);
      if (!t) throw new BulkError("Escreva o nome da tag.");
      const tag = await tx.creatorTag.upsert({
        where: { brandId_key: { brandId, key: t.key } },
        update: {},
        create: { brandId, name: t.name, key: t.key, createdById: who.userId },
        select: { id: true, name: true },
      });
      const { count } = await tx.creatorTagLink.createMany({ data: creatorIds.map((creatorId) => ({ creatorId, tagId: tag.id, brandId, createdById: who.userId })), skipDuplicates: true });
      await tx.auditLog.create({ data: { brandId, actorType: "USER", actorId: who.userId, action: "creator.tag.bulk_add", entity: "CreatorTag", entityId: tag.id, after: { tag: tag.name, creators: creatorIds, changed: count } } });
      return { tag: tag.name, changed: count };
    }
    const tag = await tx.creatorTag.findFirst({ where: { id: op.remove, brandId }, select: { id: true, name: true } });
    if (!tag) throw new BulkError("Tag não encontrada.");
    const { count } = await tx.creatorTagLink.deleteMany({ where: { tagId: tag.id, creatorId: { in: creatorIds } } });
    await tx.auditLog.create({ data: { brandId, actorType: "USER", actorId: who.userId, action: "creator.tag.bulk_remove", entity: "CreatorTag", entityId: tag.id, before: { tag: tag.name, creators: creatorIds, changed: count } } });
    return { tag: tag.name, changed: count };
  });
}

/**
 * Mensagem da equipe (D-BULKMSG) para as marcadas: aviso no portal e, com o WhatsApp da marca ligado, no WhatsApp
 * (das 9h às 20h; o envio sai aos poucos). `{nome}` e `{cupom}` viram os de cada uma.
 */
export async function bulkMessage(prisma: PrismaClient, actor: Actor | null, brandId: string, ids: readonly string[], msg: { title: string; body: string; path?: string | null; audit?: object }) {
  const title = msg.title.trim();
  const body = msg.body.trim();
  if (!title || !body) throw new BulkError("Escreva o título e a mensagem.");
  if (title.length > TEAM_MESSAGE_MAX.title) throw new BulkError(`Título com no máximo ${TEAM_MESSAGE_MAX.title} letras.`);
  if (body.length > TEAM_MESSAGE_MAX.body) throw new BulkError(`Mensagem com no máximo ${TEAM_MESSAGE_MAX.body} letras.`);
  const { actor: who, creators } = await own(prisma, actor, brandId, ids);
  const sendId = randomUUID();
  return prisma.$transaction(async (tx) => {
    const rows = creators.map((c) => {
      const coupon = c.couponAssignments.find((a) => a.coupon.kind === "CREATOR")?.coupon.code ?? c.couponAssignments[0]?.coupon.code ?? null;
      const who = { name: c.account.name, coupon };
      const filledBody = fillMessage(body, who).slice(0, TEAM_MESSAGE_MAX.body);
      return { brandId, creatorId: c.id, notice: teamMessage(sendId, fillMessage(title, who).slice(0, TEAM_MESSAGE_MAX.title), filledBody, msg.path ?? null) };
    });
    const sent = await notify(tx, rows);
    await tx.auditLog.create({ data: { brandId, actorType: "USER", actorId: who.userId, action: "creator.message.bulk", entity: "Brand", entityId: brandId, after: { sendId, title, body, creators: creators.map((c) => c.id), sent, ...(msg.audit ?? {}) } } });
    const brand = await tx.brand.findUniqueOrThrow({ where: { id: brandId }, select: { whatsappInstance: true } });
    return { sent, whatsapp: brand.whatsappInstance !== null };
  });
}
