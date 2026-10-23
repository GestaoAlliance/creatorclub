import type { PrismaClient } from "@/generated/prisma/client";
import { whatsappChatUrl } from "@/domain";

/**
 * Avisos à creator pelo WhatsApp da marca (M2.2, D-WHATSAPP). O Creator Club entrega cada aviso ao fluxo
 * "[Creator Club] Avisos WhatsApp" do n8n (`N8N_NOTICES_URL`, com `N8N_NOTICES_SECRET`), que manda pela instância da
 * Evolution da marca (`Brand.whatsappInstance`). Só das 9h às 20h de São Paulo; aviso que nasce fora disso espera; só
 * avisos das últimas 24 h (ligar depois não manda avisos velhos); poucos por rodada (o worker roda a cada minuto).
 * Com o WhatsApp ligado na marca, o aviso fica no portal e no WhatsApp, e o e-mail sai (pedido do responsável).
 */

export class WhatsAppError extends Error {}

export type WhatsAppMessage = { instance: string; phone: string; text: string; notificationId: string; kind: string; brand: string };
export type WhatsAppSender = (m: WhatsAppMessage) => Promise<void>;

const START_HOUR = 9;
const END_HOUR = 20;
const PER_RUN = 5;
const DAY = 86_400_000;

export function n8nSender(url: string, secret: string, fetchImpl: typeof fetch = fetch): WhatsAppSender {
  return async (m) => {
    let res: Response;
    try {
      res = await fetchImpl(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
        body: JSON.stringify(m),
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw new WhatsAppError("Falha de rede ao entregar o aviso ao n8n.");
    }
    if (!res.ok) throw new WhatsAppError(`O n8n recusou o aviso (${res.status}).`);
  };
}

/** Envio configurado no ambiente, ou null (sem WhatsApp: segue portal e e-mail). */
export function configuredWhatsApp(env: Record<string, string | undefined> = process.env): WhatsAppSender | null {
  const url = env.N8N_NOTICES_URL?.trim();
  const secret = env.N8N_NOTICES_SECRET?.trim();
  return url && secret && secret.length >= 32 && /^https:\/\//.test(url) ? n8nSender(url, secret) : null;
}

const hourIn = (now: Date) => Number(new Intl.DateTimeFormat("en-GB", { timeZone: "America/Sao_Paulo", hour: "2-digit", hourCycle: "h23" }).format(now));

/** Dentro do horário de mandar (9h às 20h de São Paulo). */
export function inWhatsAppHours(now: Date): boolean {
  const h = hourIn(now);
  return h >= START_HOUR && h < END_HOUR;
}

/** Texto do aviso no WhatsApp: título em negrito, o texto e o link do portal. */
export function whatsappText(n: { title: string; body: string }, link: string | null): string {
  return [`*${n.title}*`, n.body, link].filter(Boolean).join("\n\n");
}

/** Entrega os avisos pendentes ao n8n. Devolve quantos foram entregues. */
export async function whatsappPendingNotices(prisma: PrismaClient, sender: WhatsAppSender | null, origin: string | null, now = new Date()): Promise<number> {
  if (!sender || !inWhatsAppHours(now)) return 0;
  const pending = await prisma.notification.findMany({
    where: { whatsappAt: null, createdAt: { gte: new Date(now.getTime() - DAY) }, brand: { whatsappInstance: { not: null } }, creator: { account: { phone: { not: null } } } },
    orderBy: { createdAt: "asc" },
    take: 30,
    select: {
      id: true,
      kind: true,
      title: true,
      body: true,
      href: true,
      brand: { select: { name: true, slug: true, whatsappInstance: true } },
      creator: { select: { account: { select: { phone: true } } } },
    },
  });
  let sent = 0;
  for (const n of pending) {
    if (sent >= PER_RUN) break;
    const chat = whatsappChatUrl(n.creator.account.phone);
    if (!chat || !n.brand.whatsappInstance) continue; // telefone que não é celular do Brasil: fica só no portal
    const link = origin ? `${origin}${n.href ?? `/portal/${n.brand.slug}`}` : null;
    try {
      await sender({ instance: n.brand.whatsappInstance, phone: chat.replace("https://wa.me/", ""), text: whatsappText(n, link), notificationId: n.id, kind: n.kind, brand: n.brand.name });
    } catch (error) {
      if (error instanceof WhatsAppError) continue; // tenta de novo na próxima rodada (dentro das 24 h)
      throw error;
    }
    await prisma.notification.update({ where: { id: n.id }, data: { whatsappAt: now } });
    sent++;
  }
  return sent;
}
