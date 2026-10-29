import type { PrismaClient } from "@/generated/prisma/client";
import { dayKey, stockLowText } from "@/domain";
import { enqueueJob } from "@/lib/jobs/queue";
import { deliver } from "@/lib/notifications/shipping";
import { inWhatsAppHours, type WhatsAppSender } from "@/lib/notifications/whatsapp";
import { olistStockBySku, olistToken, OlistError, type OlistFetcher } from "./client";

/**
 * Estoque dos produtos do pedido das creators pelo Olist ERP (D-OLIST, só leitura): a cada 30 minutos, para cada
 * produto que a creator pode escolher (com SKU), lê o saldo no Olist pelo código igual ao da Shopify. Produto zerado
 * aparece "sem estoque" e não pode ser escolhido; com 20 ou menos, aviso diário (9h) no WhatsApp de Envio e Gestão.
 */
export const OLIST_STOCK_JOB = "olist.stock";
export const STOCK_LOW = 20;
const SLOT = 30 * 60_000;
const MAX_PRODUCTS = 25;

/** Produtos acompanhados: os marcados para o pedido (ou, sem nenhum marcado, todos os ativos), com SKU. */
async function trackedProducts(prisma: PrismaClient, brandId: string) {
  const all = await prisma.product.findMany({ where: { brandId, active: true }, select: { id: true, title: true, sku: true, kitOption: true, stockQty: true } });
  const marked = all.filter((p) => p.kitOption);
  return (marked.length ? marked : all).slice(0, MAX_PRODUCTS);
}

export async function syncOlistStock(prisma: PrismaClient, brandId: string, deps: { token?: string | null; fetcher?: OlistFetcher; now?: Date } = {}) {
  const now = deps.now ?? new Date();
  const brand = await prisma.brand.findUniqueOrThrow({ where: { id: brandId }, select: { slug: true } });
  const token = deps.token === undefined ? olistToken(brand.slug) : deps.token;
  if (!token) return { read: 0, missing: 0 };
  let read = 0;
  let missing = 0;
  for (const p of await trackedProducts(prisma, brandId)) {
    if (!p.sku) {
      await prisma.product.update({ where: { id: p.id }, data: { stockQty: null, stockSyncedAt: now, stockError: "Produto sem SKU na Shopify." } });
      missing++;
      continue;
    }
    try {
      const r = await olistStockBySku(token, p.sku, deps.fetcher);
      if (!r.found) {
        await prisma.product.update({ where: { id: p.id }, data: { stockQty: null, stockSyncedAt: now, stockError: `SKU ${p.sku} não encontrado no Olist.` } });
        missing++;
      } else {
        await prisma.product.update({ where: { id: p.id }, data: { stockQty: r.saldo, stockSyncedAt: now, stockError: null } });
        read++;
      }
    } catch (error) {
      if (!(error instanceof OlistError)) throw error;
      // Falha do Olist: guarda o motivo e mantém o último saldo lido.
      await prisma.product.update({ where: { id: p.id }, data: { stockError: error.message.slice(0, 300) } });
    }
  }
  return { read, missing };
}

/** Agenda a leitura das marcas com token do Olist, uma a cada 30 minutos. */
export async function enqueueDueOlistStock(prisma: PrismaClient, now = new Date(), env: Record<string, string | undefined> = process.env): Promise<number> {
  if (!env.OLIST_TOKENS) return 0;
  const brands = await prisma.brand.findMany({ where: { archivedAt: null }, select: { id: true, slug: true } });
  let n = 0;
  for (const b of brands) {
    if (!olistToken(b.slug, env)) continue;
    if (await enqueueJob(prisma, { type: OLIST_STOCK_JOB, brandId: b.id, dedupeKey: `olist-stock:${b.id}:${Math.floor(now.getTime() / SLOT)}`, runAt: now, maxAttempts: 1 })) n++;
  }
  return n;
}

export function olistHandlers(prisma: PrismaClient) {
  return {
    [OLIST_STOCK_JOB]: async (job: { brandId: string | null }) => {
      if (!job.brandId) throw new Error("Tarefa sem marca.");
      await syncOlistStock(prisma, job.brandId);
    },
  };
}

/** Aviso diário (a partir das 9h) de estoque baixo para Envio e Gestão da marca. */
export async function runStockAlerts(prisma: PrismaClient, sender: WhatsAppSender | null, origin: string | null, now = new Date()): Promise<number> {
  if (!sender || !inWhatsAppHours(now)) return 0;
  const brands = await prisma.brand.findMany({ where: { archivedAt: null, whatsappInstance: { not: null } }, select: { id: true, name: true, slug: true, whatsappInstance: true } });
  let sent = 0;
  for (const b of brands) {
    const low = (await trackedProducts(prisma, b.id)).filter((p) => p.stockQty !== null && p.stockQty <= STOCK_LOW);
    if (!low.length) continue;
    const people = await prisma.user.findMany({
      where: { disabledAt: null, phone: { not: null }, roleGrants: { some: { role: { in: ["ENVIO", "GESTAO"] }, brandId: b.id } } },
      select: { id: true, phone: true },
    });
    const day = dayKey(now, "America/Sao_Paulo");
    const text = stockLowText(b.name, low.map((p) => ({ title: p.title, qty: p.stockQty! })), origin ? `${origin}/admin/envios` : null);
    sent += (await deliver(prisma, sender, { ...b, whatsappInstance: b.whatsappInstance! }, people, (u) => `stock-low:${b.slug}:${day}:${u}`, "STOCK_LOW", text)).sent;
  }
  return sent;
}
