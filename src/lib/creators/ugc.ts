import type { PrismaClient } from "@/generated/prisma/client";
import { dayKey, isDayKey, isUgc, isValidVideoGoal, normalizeVideoUrl, ugcCycle, UGC_MAX_VIDEO_GOAL, type UgcCycle } from "@/domain";
import { dayOf } from "./contract";
import type { Actor } from "@/lib/auth/actor";
import { can } from "@/lib/auth/permissions";

/**
 * Vídeos da UGC (D-UGCVIDEOS): a equipe registra cada vídeo entregue (link, data e, se quiser, o produto) e define a
 * meta do ciclo na ficha; o ciclo é o período do contrato. Registro errado é retirado, nunca apagado.
 * Ver: `creators.view`; mudar: `creators.edit` da marca.
 */

export class UgcError extends Error {}

const toDate = (day: string) => new Date(`${day}T00:00:00Z`);

async function editable(prisma: PrismaClient, actor: Actor | null, creatorId: string) {
  const creator = await prisma.creator.findUnique({
    where: { id: creatorId },
    select: { id: true, brandId: true, status: true, categories: true, ugcVideoGoal: true, brand: { select: { timezone: true } } },
  });
  if (!creator) throw new UgcError("Creator não encontrada.");
  if (!actor || !can(actor.grants, "creators.edit", creator.brandId)) throw new UgcError("Sem permissão.");
  if (!isUgc(creator.categories)) throw new UgcError("Só creators do tipo UGC têm meta de vídeos.");
  return { ...creator, actor };
}

/** Ciclo atual de cada UGC (para a lista e a ficha). Quem não é UGC fica de fora. */
export async function ugcCyclesFor(
  prisma: PrismaClient,
  creators: { id: string; categories: string[]; contractStart: Date | null; contractEnd: Date | null; ugcVideoGoal: number | null }[],
  timeZone: string,
  now = new Date(),
): Promise<Map<string, UgcCycle>> {
  const ugc = creators.filter((c) => isUgc(c.categories));
  const out = new Map<string, UgcCycle>();
  if (ugc.length === 0) return out;
  const videos = await prisma.ugcVideo.findMany({
    where: { creatorId: { in: ugc.map((c) => c.id) }, removedAt: null },
    select: { creatorId: true, deliveredOn: true },
  });
  const today = dayKey(now, timeZone);
  for (const c of ugc) {
    const videoDays = videos.filter((v) => v.creatorId === c.id).map((v) => dayOf(v.deliveredOn)!);
    out.set(c.id, ugcCycle({ start: dayOf(c.contractStart), end: dayOf(c.contractEnd), goal: c.ugcVideoGoal, videoDays }, today));
  }
  return out;
}

/** Vídeos registrados (os retirados não aparecem), do mais recente para o mais antigo. */
export async function ugcVideosOf(prisma: PrismaClient, creatorId: string) {
  const rows = await prisma.ugcVideo.findMany({
    where: { creatorId, removedAt: null },
    orderBy: [{ deliveredOn: "desc" }, { createdAt: "desc" }],
    select: { id: true, deliveredOn: true, url: true, product: true },
  });
  return rows.map((v) => ({ id: v.id, day: dayOf(v.deliveredOn)!, url: v.url, product: v.product }));
}

export async function addUgcVideo(
  prisma: PrismaClient,
  actor: Actor | null,
  input: { creatorId: string; url: string; day: string; product: string },
  now = new Date(),
) {
  const c = await editable(prisma, actor, input.creatorId);
  if (c.status === "DEACTIVATED") throw new UgcError("Creator desligada não recebe vídeo novo.");
  const url = normalizeVideoUrl(input.url);
  if (!url) throw new UgcError("Cole o link do vídeo (começando com https://).");
  if (!isDayKey(input.day)) throw new UgcError("Data inválida.");
  if (input.day > dayKey(now, c.brand.timezone)) throw new UgcError("A data de entrega não pode ser no futuro.");
  const product = input.product.trim().replace(/\s+/g, " ").slice(0, 100) || null;
  if (await prisma.ugcVideo.findFirst({ where: { creatorId: c.id, url, removedAt: null }, select: { id: true } }))
    throw new UgcError("Este vídeo já está registrado.");
  return prisma.$transaction(async (tx) => {
    const v = await tx.ugcVideo.create({
      data: { brandId: c.brandId, creatorId: c.id, deliveredOn: toDate(input.day), url, product, createdById: c.actor.userId },
    });
    await tx.auditLog.create({
      data: { brandId: c.brandId, actorType: "USER", actorId: c.actor.userId, action: "ugc.video_added", entity: "UgcVideo", entityId: v.id, after: { creatorId: c.id, day: input.day, url, product } },
    });
    return v.id;
  });
}

export async function removeUgcVideo(prisma: PrismaClient, actor: Actor | null, videoId: string, now = new Date()) {
  const v = await prisma.ugcVideo.findUnique({ where: { id: videoId }, select: { id: true, creatorId: true, removedAt: true, url: true } });
  if (!v) throw new UgcError("Vídeo não encontrado.");
  const c = await editable(prisma, actor, v.creatorId);
  if (v.removedAt) return;
  await prisma.$transaction([
    prisma.ugcVideo.update({ where: { id: v.id }, data: { removedAt: now, removedById: c.actor.userId } }),
    prisma.auditLog.create({
      data: { brandId: c.brandId, actorType: "USER", actorId: c.actor.userId, action: "ugc.video_removed", entity: "UgcVideo", entityId: v.id, before: { url: v.url } },
    }),
  ]);
}

export async function setUgcVideoGoal(prisma: PrismaClient, actor: Actor | null, creatorId: string, goal: number) {
  const c = await editable(prisma, actor, creatorId);
  if (!isValidVideoGoal(goal)) throw new UgcError(`A meta precisa ser um número de 1 a ${UGC_MAX_VIDEO_GOAL}.`);
  if (c.ugcVideoGoal === goal) return;
  await prisma.$transaction([
    prisma.creator.update({ where: { id: c.id }, data: { ugcVideoGoal: goal } }),
    prisma.auditLog.create({
      data: { brandId: c.brandId, actorType: "USER", actorId: c.actor.userId, action: "ugc.video_goal", entity: "Creator", entityId: c.id, before: { goal: c.ugcVideoGoal }, after: { goal } },
    }),
  ]);
}
