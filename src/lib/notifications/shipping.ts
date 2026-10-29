import type { PrismaClient } from "@/generated/prisma/client";
import { dayKey, SHIP_STUCK_DAYS, shippingNewText, shippingStuckText, type ShippingAlertItem } from "@/domain";
import { inWhatsAppHours, WhatsAppError, type WhatsAppSender } from "./whatsapp";

/**
 * Avisos de envio no WhatsApp de quem é Envio na marca (D-SHIPALERT), pelo mesmo fluxo do n8n dos avisos, com o
 * telefone cadastrado em Equipe: (1) de hora em hora, os envios que entraram em "Preparando" desde o último resumo
 * (das 9h às 20h; o que entra fora disso vai às 9h); (2) todo dia a partir das 9h, os parados em "Preparando" há 3 dias
 * corridos ou mais (desde a aprovação do pedido ou, sem aprovação, desde o registro). `SummaryRun` garante um envio por
 * marca, hora (ou dia) e pessoa; falha do n8n libera para tentar no minuto seguinte.
 */

const DAY = 86_400_000;
const TZ = "America/Sao_Paulo";
const hourKey = (now: Date) => `${dayKey(now, TZ)}T${new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", hourCycle: "h23" }).format(now)}`;

const ITEMS = { creator: { select: { account: { select: { name: true } } } }, items: { orderBy: { title: "asc" as const }, select: { title: true, quantity: true } } };

export async function deliver(
  prisma: PrismaClient,
  sender: WhatsAppSender,
  brand: { id: string; name: string; whatsappInstance: string },
  people: readonly { id: string; phone: string | null }[],
  keyFor: (userId: string) => string,
  kind: string,
  text: string,
): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;
  for (const u of people) {
    const key = keyFor(u.id);
    const claim = await prisma.summaryRun.createMany({ data: [{ key, brandId: brand.id, userId: u.id }], skipDuplicates: true });
    if (claim.count === 0) continue; // já foi (ou outra rodada pegou)
    try {
      await sender({ instance: brand.whatsappInstance, phone: u.phone!, text, notificationId: key, kind, brand: brand.name });
      sent++;
    } catch (error) {
      await prisma.summaryRun.deleteMany({ where: { key } });
      if (!(error instanceof WhatsAppError)) throw error;
      failed++;
    }
  }
  return { sent, failed };
}

export async function runShippingAlerts(prisma: PrismaClient, sender: WhatsAppSender | null, origin: string | null, now = new Date()): Promise<number> {
  if (!sender || !inWhatsAppHours(now)) return 0;
  const brands = await prisma.brand.findMany({ where: { archivedAt: null, whatsappInstance: { not: null } }, select: { id: true, name: true, slug: true, whatsappInstance: true } });
  const link = origin ? `${origin}/admin/envios?situacao=PREPARING` : null;
  let total = 0;
  for (const b of brands) {
    const brand = { ...b, whatsappInstance: b.whatsappInstance! };
    const people = await prisma.user.findMany({ where: { disabledAt: null, phone: { not: null }, roleGrants: { some: { role: "ENVIO", brandId: b.id } } }, select: { id: true, phone: true } });
    if (!people.length) continue;

    // (1) Envios novos em "Preparando", uma vez por hora.
    const fresh = await prisma.shipment.findMany({ where: { brandId: b.id, status: "PREPARING", staffNotifiedAt: null }, orderBy: { createdAt: "asc" }, select: { id: true, ...ITEMS } });
    if (fresh.length) {
      const hour = hourKey(now);
      const list: ShippingAlertItem[] = fresh.map((s) => ({ creator: s.creator.account.name, items: s.items }));
      const r = await deliver(prisma, sender, brand, people, (u) => `ship-new:${b.slug}:${hour}:${u}`, "SHIPPING_NEW", shippingNewText(b.name, list, link));
      total += r.sent;
      // Só marca o que foi neste resumo, e quando ninguém ficou sem receber (falha tenta de novo com a mesma lista).
      // Resumo desta hora já enviado: quem chegou depois espera a próxima hora.
      if (r.sent > 0 && r.failed === 0) await prisma.shipment.updateMany({ where: { id: { in: fresh.map((s) => s.id) }, staffNotifiedAt: null }, data: { staffNotifiedAt: now } });
    }

    // (2) Lembrete diário dos parados há 3 dias ou mais.
    const limit = new Date(now.getTime() - SHIP_STUCK_DAYS * DAY);
    const stuck = await prisma.shipment.findMany({
      where: { brandId: b.id, status: "PREPARING", OR: [{ approvedAt: { lte: limit } }, { approvedAt: null, createdAt: { lte: limit } }] },
      orderBy: { createdAt: "asc" },
      select: { createdAt: true, approvedAt: true, ...ITEMS },
    });
    if (stuck.length) {
      const day = dayKey(now, TZ);
      const list: ShippingAlertItem[] = stuck.map((s) => ({ creator: s.creator.account.name, items: s.items, days: Math.floor((now.getTime() - (s.approvedAt ?? s.createdAt).getTime()) / DAY) }));
      total += (await deliver(prisma, sender, brand, people, (u) => `ship-stuck:${b.slug}:${day}:${u}`, "SHIPPING_STUCK", shippingStuckText(b.name, list, link))).sent;
    }
  }
  return total;
}
