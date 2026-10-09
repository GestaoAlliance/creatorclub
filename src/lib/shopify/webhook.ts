import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { PrismaClient } from "@/generated/prisma/client";
import { enqueueJob } from "@/lib/jobs/queue";
import { loadShopifyConnection } from "./credentials";
import { ORDER_SYNC_JOB } from "./jobs";

/**
 * Recebimento do webhook do Shopify (D-QUEUE): valida a assinatura (HMAC do corpo cru com a chave do app),
 * grava `WebhookEvent` + `Job` na mesma transação e só então responde 200. Nada roda depois da resposta;
 * o pedido é buscado e gravado pelo worker (`shopify.order.sync`).
 */

/** Tópicos que viram tarefa de sync do pedido. Os demais são gravados como IGNORED. */
export const ORDER_TOPICS = new Set(["orders/create", "orders/updated", "orders/paid", "orders/cancelled", "refunds/create"]);

export function shopifyHmac(rawBody: Buffer, secret: string): string {
  return createHmac("sha256", secret).update(rawBody).digest("base64");
}

/** Compara a assinatura recebida (base64) em tempo constante. */
export function verifyShopifyHmac(rawBody: Buffer, secret: string, received: string | null): boolean {
  if (!received || !secret) return false;
  const expected = Buffer.from(shopifyHmac(rawBody, secret), "base64");
  const got = Buffer.from(received, "base64");
  return got.length === expected.length && timingSafeEqual(got, expected);
}

/** Pedido a que o aviso se refere, no formato GID. */
export function orderGidFromPayload(topic: string, payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;
  if (topic.startsWith("orders/")) {
    if (typeof p.admin_graphql_api_id === "string" && p.admin_graphql_api_id.startsWith("gid://shopify/Order/")) return p.admin_graphql_api_id;
    if (typeof p.id === "number" || (typeof p.id === "string" && /^\d+$/.test(p.id))) return `gid://shopify/Order/${p.id}`;
    return null;
  }
  if (topic === "refunds/create" && (typeof p.order_id === "number" || (typeof p.order_id === "string" && /^\d+$/.test(p.order_id)))) {
    return `gid://shopify/Order/${p.order_id}`;
  }
  return null;
}

export type WebhookResponse = { status: number; body: Record<string, unknown> };

// Lê cabeçalho com ou sem o prefixo "X-" (o Shopify usa os dois formatos).
const header = (h: Headers, name: string) => h.get(`x-${name}`) ?? h.get(name);

export async function receiveShopifyWebhook(
  prisma: PrismaClient,
  input: { brandSlug: string; headers: Headers; rawBody: Buffer },
  encKey?: Buffer,
): Promise<WebhookResponse> {
  const brand = await prisma.brand.findUnique({ where: { slug: input.brandSlug }, select: { id: true } });
  const conn = brand ? await loadShopifyConnection(prisma, brand.id, encKey) : null;
  if (!brand || !conn) return { status: 404, body: { ok: false } };

  const h = input.headers;
  if (!verifyShopifyHmac(input.rawBody, conn.clientSecret, header(h, "shopify-hmac-sha256"))) {
    return { status: 401, body: { ok: false } };
  }
  if ((header(h, "shopify-shop-domain") ?? "").toLowerCase() !== conn.shop) return { status: 401, body: { ok: false } };

  const topic = header(h, "shopify-topic") ?? "";
  const webhookId = header(h, "shopify-webhook-id") ?? header(h, "shopify-event-id");
  if (!topic || !webhookId) return { status: 400, body: { ok: false } };

  let payload: unknown = null;
  try {
    payload = JSON.parse(input.rawBody.toString("utf8"));
  } catch {
    payload = null;
  }
  const orderGid = ORDER_TOPICS.has(topic) ? orderGidFromPayload(topic, payload) : null;
  const payloadHash = createHash("sha256").update(input.rawBody).digest("hex");

  return prisma.$transaction(async (tx) => {
    const { count } = await tx.webhookEvent.createMany({
      data: [
        {
          brandId: brand.id,
          topic,
          webhookId,
          resourceId: orderGid,
          payloadHash,
          status: orderGid ? "RECEIVED" : "IGNORED",
        },
      ],
      skipDuplicates: true,
    });
    if (count === 0) return { status: 200, body: { ok: true, duplicate: true } };
    if (orderGid) {
      const event = await tx.webhookEvent.findUniqueOrThrow({ where: { brandId_webhookId: { brandId: brand.id, webhookId } }, select: { id: true } });
      await enqueueJob(tx, {
        type: ORDER_SYNC_JOB,
        brandId: brand.id,
        payload: { orderGid, webhookEventId: event.id },
        dedupeKey: `webhook:${brand.id}:${webhookId}`,
      });
    }
    return { status: 200, body: { ok: true } };
  });
}
