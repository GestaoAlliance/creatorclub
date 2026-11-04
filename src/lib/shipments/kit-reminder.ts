import type { PrismaClient } from "@/generated/prisma/client";
import { dayKey, kitReminderMessage, whatsappChatUrl } from "@/domain";
import type { Actor } from "@/lib/auth/actor";
import { can } from "@/lib/auth/permissions";
import { enqueueJob, type JobHandlers } from "@/lib/jobs/queue";
import { siteOrigin } from "@/lib/notifications/scheduled";
import { configuredWhatsApp, inWhatsAppHours, type WhatsAppSender } from "@/lib/notifications/whatsapp";
import { nextWhatsAppTime } from "@/lib/autentique/applications";
import { FIRST_KIT_NOTICE_JOB, FIRST_KIT_SPACING_MS } from "./first-kit-notice";

const portal = (slug: string) => `${siteOrigin() ?? "https://creatorclub.app.br"}/portal/${slug}/envios`;

/**
 * D-KITREMINDER: lembrete no WhatsApp a quem tem produto liberado (boas-vindas ou mensal) e ainda não escolheu.
 * A Gestão da marca (ou o super admin) vê em Envios quantas e quem recebe e dispara no clique; sai espaçado (uma a
 * cada 45 s, das 9h às 20h), uma vez por pessoa (com os kits parados de agora), e não repete para quem já está na
 * fila do aviso do 1º produto.
 */

export const KIT_REMINDER_JOB = "kit.reminder";
const key = (grantId: string) => `kit-reminder:${grantId}`;
const firstKey = (grantId: string) => `first-kit-notice:${grantId}`;

export class KitReminderError extends Error {}

export async function kitReminderAudience(prisma: PrismaClient, brandId: string) {
  const brand = await prisma.brand.findUniqueOrThrow({ where: { id: brandId }, select: { name: true, slug: true, whatsappInstance: true } });
  const grants = await prisma.kitGrant.findMany({
    where: { brandId, status: "PENDING", creator: { status: "ACTIVE", archivedAt: null } },
    orderBy: { createdAt: "asc" },
    select: { id: true, creatorId: true, creator: { select: { account: { select: { name: true, phone: true } } } } },
  });
  const keys = grants.flatMap((g) => [key(g.id), firstKey(g.id)]);
  const sent = new Set((await prisma.job.findMany({ where: { type: { in: [KIT_REMINDER_JOB, FIRST_KIT_NOTICE_JOB] }, dedupeKey: { in: keys } }, select: { dedupeKey: true } })).map((j) => j.dedupeKey));
  // Uma mensagem por pessoa: com dois kits parados, vai uma só (pelo mais antigo); quem já foi avisada por um deles fica de fora.
  const seen = new Set(grants.filter((g) => sent.has(key(g.id)) || sent.has(firstKey(g.id))).map((g) => g.creatorId));
  const people = grants.filter((g) => {
    if (seen.has(g.creatorId) || !whatsappChatUrl(g.creator.account.phone)) return false;
    seen.add(g.creatorId);
    return true;
  });
  return { brand, grantIds: people.map((g) => g.id), names: people.map((g) => g.creator.account.name) };
}

export function kitReminderPreview(brand: { name: string; slug: string }) {
  return kitReminderMessage({ name: "Fulana", brand: brand.name, link: portal(brand.slug) });
}

export async function startKitReminders(prisma: PrismaClient, actor: Actor | null, brandId: string, now = new Date()) {
  if (!actor || !can(actor.grants, "creators.edit", brandId)) throw new KitReminderError("Sem permissão.");
  const { brand, grantIds } = await kitReminderAudience(prisma, brandId);
  if (!brand.whatsappInstance) throw new KitReminderError("Esta marca ainda não tem WhatsApp ligado.");
  if (grantIds.length === 0) throw new KitReminderError("Ninguém para lembrar agora.");
  const start = nextWhatsAppTime(now).getTime();
  const queued = await prisma.$transaction(async (tx) => {
    let n = 0;
    for (const [i, grantId] of grantIds.entries()) {
      if (await enqueueJob(tx, { type: KIT_REMINDER_JOB, brandId, payload: { grantId }, dedupeKey: key(grantId), runAt: new Date(start + i * FIRST_KIT_SPACING_MS) })) n++;
    }
    await tx.auditLog.create({ data: { brandId, actorType: "USER", actorId: actor.userId, action: "kit.reminder", entity: "Brand", entityId: brandId, after: { queued: n } } });
    return n;
  });
  return { queued };
}

/** Um lembrete: só se o kit ainda está para escolher; fora do horário, volta para a fila no próximo 9h. */
export async function sendKitReminder(prisma: PrismaClient, sender: WhatsAppSender | null, grantId: string, now = new Date()) {
  const g = await prisma.kitGrant.findUnique({
    where: { id: grantId },
    select: { brandId: true, status: true, brand: { select: { name: true, slug: true, whatsappInstance: true } }, creator: { select: { status: true, account: { select: { name: true, phone: true } } } } },
  });
  if (!g || g.status !== "PENDING" || g.creator.status !== "ACTIVE" || !sender || !g.brand.whatsappInstance) return false;
  const chat = whatsappChatUrl(g.creator.account.phone);
  if (!chat) return false;
  if (!inWhatsAppHours(now)) {
    await enqueueJob(prisma, { type: KIT_REMINDER_JOB, brandId: g.brandId, payload: { grantId }, dedupeKey: `${key(grantId)}:${dayKey(now)}`, runAt: nextWhatsAppTime(now) });
    return false;
  }
  await sender({
    instance: g.brand.whatsappInstance, phone: chat.replace("https://wa.me/", ""), notificationId: key(grantId), kind: "KIT_REMINDER", brand: g.brand.name,
    text: kitReminderMessage({ name: g.creator.account.name, brand: g.brand.name, link: portal(g.brand.slug) }),
  });
  return true;
}

export function kitReminderHandlers(prisma: PrismaClient): JobHandlers {
  return {
    [KIT_REMINDER_JOB]: async (job) => {
      const id = (job.payload as { grantId?: string } | null)?.grantId;
      if (id) await sendKitReminder(prisma, configuredWhatsApp(), id);
    },
  };
}
