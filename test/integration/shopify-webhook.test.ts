import { randomBytes } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { saveShopifyCredentials } from "@/lib/shopify/credentials";
import { orderSyncHandler } from "@/lib/shopify/jobs";
import { receiveShopifyWebhook, shopifyHmac } from "@/lib/shopify/webhook";
import type { ShopifyClient } from "@/lib/shopify/client";
import { shopifyOrder } from "../shopify-order-fixture";
import { seedBrand, testClient } from "./fixtures";

const prisma = testClient();
afterAll(() => prisma.$disconnect());
const key = randomBytes(32);
const SECRET = "client-secret-do-app";

async function connectedBrand() {
  const { brand } = await seedBrand(prisma);
  const shop = `${brand.slug}.myshopify.com`;
  await saveShopifyCredentials(prisma, { brandId: brand.id, shop, clientId: "cid", clientSecret: SECRET }, key);
  return { brand, shop };
}

function delivery(shop: string, opts: { topic?: string; webhookId?: string; body?: unknown; secret?: string; prefix?: string } = {}) {
  const rawBody = Buffer.from(JSON.stringify(opts.body ?? { id: 1001, admin_graphql_api_id: "gid://shopify/Order/1001" }));
  const p = opts.prefix ?? "X-";
  const headers = new Headers({
    [`${p}Shopify-Hmac-Sha256`]: shopifyHmac(rawBody, opts.secret ?? SECRET),
    [`${p}Shopify-Topic`]: opts.topic ?? "orders/paid",
    [`${p}Shopify-Shop-Domain`]: shop,
    [`${p}Shopify-Webhook-Id`]: opts.webhookId ?? `wh-${randomBytes(4).toString("hex")}`,
  });
  return { headers, rawBody };
}

describe("webhook do Shopify (banco real)", () => {
  it("assinatura válida grava evento + tarefa na mesma transação; aviso repetido não duplica", async () => {
    const { brand, shop } = await connectedBrand();
    const d = delivery(shop, { webhookId: "wh-1" });
    expect(await receiveShopifyWebhook(prisma, { brandSlug: brand.slug, ...d }, key)).toEqual({ status: 200, body: { ok: true } });
    expect(await receiveShopifyWebhook(prisma, { brandSlug: brand.slug, ...d }, key)).toEqual({ status: 200, body: { ok: true, duplicate: true } });

    const events = await prisma.webhookEvent.findMany({ where: { brandId: brand.id } });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ topic: "orders/paid", webhookId: "wh-1", resourceId: "gid://shopify/Order/1001", status: "RECEIVED" });
    const jobs = await prisma.job.findMany({ where: { brandId: brand.id } });
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ type: "shopify.order.sync", payload: { orderGid: "gid://shopify/Order/1001", webhookEventId: events[0]!.id } });
  });

  it("assinatura errada ou loja trocada: 401 sem gravar nada", async () => {
    const { brand, shop } = await connectedBrand();
    const wrong = delivery(shop, { secret: "chave-errada" });
    expect((await receiveShopifyWebhook(prisma, { brandSlug: brand.slug, ...wrong }, key)).status).toBe(401);
    const otherShop = delivery("outra-loja.myshopify.com");
    expect((await receiveShopifyWebhook(prisma, { brandSlug: brand.slug, ...otherShop }, key)).status).toBe(401);
    const tampered = delivery(shop);
    expect((await receiveShopifyWebhook(prisma, { brandSlug: brand.slug, headers: tampered.headers, rawBody: Buffer.from('{"id":2}') }, key)).status).toBe(401);
    expect(await prisma.webhookEvent.count({ where: { brandId: brand.id } })).toBe(0);
    expect(await prisma.job.count({ where: { brandId: brand.id } })).toBe(0);
  });

  it("marca inexistente ou sem Shopify: 404", async () => {
    const { brand } = await seedBrand(prisma);
    expect((await receiveShopifyWebhook(prisma, { brandSlug: "nao-existe", ...delivery("x.myshopify.com") }, key)).status).toBe(404);
    expect((await receiveShopifyWebhook(prisma, { brandSlug: brand.slug, ...delivery("x.myshopify.com") }, key)).status).toBe(404);
  });

  it("tópico fora dos pedidos fica gravado como IGNORED, sem tarefa; cabeçalhos sem o X- também valem", async () => {
    const { brand, shop } = await connectedBrand();
    const d = delivery(shop, { topic: "products/update", body: { id: 5 }, prefix: "" });
    expect((await receiveShopifyWebhook(prisma, { brandSlug: brand.slug, ...d }, key)).status).toBe(200);
    expect(await prisma.webhookEvent.findFirstOrThrow({ where: { brandId: brand.id } })).toMatchObject({ status: "IGNORED", resourceId: null });
    expect(await prisma.job.count({ where: { brandId: brand.id } })).toBe(0);
  });

  it("reembolso vira tarefa do pedido; a tarefa marca o evento como PROCESSED", async () => {
    const { brand, shop } = await connectedBrand();
    const d = delivery(shop, { topic: "refunds/create", body: { id: 9, order_id: 1001 } });
    await receiveShopifyWebhook(prisma, { brandSlug: brand.slug, ...d }, key);
    const job = await prisma.job.findFirstOrThrow({ where: { brandId: brand.id } });
    const client = async () => ({ shop, graphql: async () => ({ order: shopifyOrder() }) }) as unknown as ShopifyClient;
    await orderSyncHandler(prisma, client)({ id: job.id, brandId: brand.id, type: job.type, payload: job.payload, attempts: 1, maxAttempts: 8 });
    expect(await prisma.webhookEvent.findFirstOrThrow({ where: { brandId: brand.id } })).toMatchObject({ status: "PROCESSED" });
    expect(await prisma.order.count({ where: { brandId: brand.id, shopifyId: "gid://shopify/Order/1001" } })).toBe(1);
  });

  it("sem tópico ou id do aviso: 400 sem gravar", async () => {
    const { brand, shop } = await connectedBrand();
    const d = delivery(shop);
    d.headers.delete("X-Shopify-Webhook-Id");
    expect((await receiveShopifyWebhook(prisma, { brandSlug: brand.slug, ...d }, key)).status).toBe(400);
    expect(await prisma.webhookEvent.count({ where: { brandId: brand.id } })).toBe(0);
  });
});
