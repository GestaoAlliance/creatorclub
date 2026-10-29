import type { PrismaClient } from "@/generated/prisma/client";
import { dayKey, firstKitMessage, whatsappChatUrl } from "@/domain";
import type { Actor } from "@/lib/auth/actor";
import { brandsWith } from "@/lib/auth/permissions";
import { enqueueJob, type JobHandlers } from "@/lib/jobs/queue";
import { siteOrigin } from "@/lib/notifications/scheduled";
import { configuredWhatsApp, inWhatsAppHours, type WhatsAppSender } from "@/lib/notifications/whatsapp";
import { nextWhatsAppTime } from "@/lib/autentique/applications";

const portal = (slug: string) => `${siteOrigin() ?? "https://creatorclub.app.br"}/portal/${slug}/envios`;

/**
 * D-FIRSTKITNOTICE: aviso no WhatsApp a quem ganhou o 1º produto (D-FIRSTKIT, `kit.first` no histórico). Fica pronto
 * e só sai quando o super admin clica em Envios; as mensagens saem espaçadas (uma a cada 45 s, das 9h às 20h), uma
 * vez por produto, e só para quem ainda não pediu.
 */

export const FIRST_KIT_NOTICE_JOB = "kit.first_notice";
export const FIRST_KIT_SPACING_MS = 45_000;
const key = (grantId: string) => `first-kit-notice:${grantId}`;

export class FirstKitNoticeError extends Error {}

/** Quem receberia o aviso agora: produto do D-FIRSTKIT ainda sem pedir, com celular e sem aviso já na fila. */
export async function firstKitAudience(prisma: PrismaClient, brandId: string) {
  const brand = await prisma.brand.findUniqueOrThrow({ where: { id: brandId }, select: { name: true, slug: true, whatsappInstance: true } });
  const marked = await prisma.auditLog.findMany({ where: { brandId, action: "kit.first", entity: "Creator" }, select: { entityId: true } });
  const grants = await prisma.kitGrant.findMany({
    where: { brandId, kind: "WELCOME", status: "PENDING", creatorId: { in: marked.map((m) => m.entityId) }, creator: { status: "ACTIVE" } },
    select: { id: true, creator: { select: { account: { select: { name: true, phone: true } } } } },
  });
  const queued = new Set(
    (await prisma.job.findMany({ where: { type: FIRST_KIT_NOTICE_JOB, dedupeKey: { in: grants.map((g) => key(g.id)) } }, select: { dedupeKey: true } })).map((j) => j.dedupeKey),
  );
  const people = grants.filter((g) => !queued.has(key(g.id)) && whatsappChatUrl(g.creator.account.phone));
  return { brand, grantIds: people.map((g) => g.id), names: people.map((g) => g.creator.account.name) };
}

/** Texto que vai (com o nome de cada uma no lugar de "Fulana"). */
export function firstKitPreview(brand: { name: string; slug: string }) {
  return firstKitMessage({ name: "Fulana", brand: brand.name, link: portal(brand.slug) });
}

export async function startFirstKitNotices(prisma: PrismaClient, actor: Actor | null, brandId: string, now = new Date()) {
  if (!actor || brandsWith(actor.grants, "staff.manage") !== "ALL") throw new FirstKitNoticeError("Só o super admin dispara este aviso.");
  const { brand, grantIds } = await firstKitAudience(prisma, brandId);
  if (!brand.whatsappInstance) throw new FirstKitNoticeError("Esta marca ainda não tem WhatsApp ligado.");
  if (grantIds.length === 0) throw new FirstKitNoticeError("Ninguém para avisar agora.");
  const start = nextWhatsAppTime(now).getTime();
  const queued = await prisma.$transaction(async (tx) => {
    let n = 0;
    for (const [i, grantId] of grantIds.entries()) {
      if (await enqueueJob(tx, { type: FIRST_KIT_NOTICE_JOB, brandId, payload: { grantId }, dedupeKey: key(grantId), runAt: new Date(start + i * FIRST_KIT_SPACING_MS) })) n++;
    }
    await tx.auditLog.create({ data: { brandId, actorType: "USER", actorId: actor.userId, action: "kit.first_notice", entity: "Brand", entityId: brandId, after: { queued: n } } });
    return n;
  });
  return { queued };
}

/** Um aviso: só se o produto ainda está para pedir; fora do horário, volta para a fila no próximo 9h. */
export async function sendFirstKitNotice(prisma: PrismaClient, sender: WhatsAppSender | null, grantId: string, now = new Date()) {
  const g = await prisma.kitGrant.findUnique({
    where: { id: grantId },
    select: { id: true, brandId: true, status: true, brand: { select: { name: true, slug: true, whatsappInstance: true } }, creator: { select: { status: true, account: { select: { name: true, phone: true } } } } },
  });
  if (!g || g.status !== "PENDING" || g.creator.status !== "ACTIVE" || !sender || !g.brand.whatsappInstance) return false;
  const chat = whatsappChatUrl(g.creator.account.phone);
  if (!chat) return false;
  if (!inWhatsAppHours(now)) {
    await enqueueJob(prisma, { type: FIRST_KIT_NOTICE_JOB, brandId: g.brandId, payload: { grantId }, dedupeKey: `${key(grantId)}:${dayKey(now)}`, runAt: nextWhatsAppTime(now) });
    return false;
  }
  // Falha do n8n sobe: a fila tenta de novo.
  await sender({
    instance: g.brand.whatsappInstance, phone: chat.replace("https://wa.me/", ""), notificationId: key(grantId), kind: "FIRST_KIT", brand: g.brand.name,
    text: firstKitMessage({ name: g.creator.account.name, brand: g.brand.name, link: portal(g.brand.slug) }),
  });
  return true;
}

export function firstKitHandlers(prisma: PrismaClient): JobHandlers {
  return {
    [FIRST_KIT_NOTICE_JOB]: async (job) => {
      const id = (job.payload as { grantId?: string } | null)?.grantId;
      if (id) await sendFirstKitNotice(prisma, configuredWhatsApp(), id);
    },
  };
}
