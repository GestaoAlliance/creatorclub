import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { loadActor } from "@/lib/auth/actor";
import type { ShopifyClient } from "@/lib/shopify/client";
import { saveShopifyCredentials } from "@/lib/shopify/credentials";
import {
  enqueueDueReconciles,
  RECONCILE_MARGIN_MS,
  RECONCILE_MAX_PAGES,
  reconcileBrand,
  requestSyncNow,
} from "@/lib/shopify/reconcile";
import type { ShopifyOrderNode } from "@/lib/shopify/orders";
import { shopifyOrder } from "../shopify-order-fixture";
import { seedBrand, testClient } from "./fixtures";

const prisma = testClient();
afterAll(() => prisma.$disconnect());
const key = randomBytes(32);
const NOW = new Date("2026-10-09T12:00:00Z");

async function connectedBrand() {
  const { brand } = await seedBrand(prisma);
  await saveShopifyCredentials(prisma, { brandId: brand.id, shop: `${brand.slug}.myshopify.com`, clientId: "t", clientSecret: "w" }, key);
  return brand;
}

/** Shopify falso: devolve as páginas na ordem e guarda as variáveis de cada chamada. */
function fakeShopify(pages: ShopifyOrderNode[][]) {
  const calls: Array<Record<string, unknown>> = [];
  const client = {
    shop: "x.myshopify.com",
    graphql: async (_q: string, vars: Record<string, unknown>) => {
      const i = calls.length;
      calls.push(vars);
      const nodes = pages[i] ?? [];
      return { orders: { nodes, pageInfo: { hasNextPage: i + 1 < pages.length, endCursor: `c${i + 1}` } } };
    },
  } as unknown as ShopifyClient;
  return { client, calls };
}

const order = (n: number, updatedAt = "2026-10-09T11:50:00Z") =>
  shopifyOrder({ id: `gid://shopify/Order/${n}`, name: `#${n}`, updatedAt });

describe("reconciliação (banco real)", () => {
  it("primeira passada olha os últimos 30 min; grava pedidos, conta e registra a passada", async () => {
    const brand = await connectedBrand();
    const { client, calls } = fakeShopify([[order(1), order(2)], [order(3)]]);
    const r = await reconcileBrand(prisma, brand.id, client, { now: NOW });
    expect(calls[0]).toEqual({ q: "updated_at:>='2026-10-09T11:30:00.000Z'", after: null });
    expect(calls[1]).toMatchObject({ after: "c1" });
    expect(r).toMatchObject({ ordersSeen: 3, ordersFixed: 3, deferred: 0 });
    expect(r.cursor.toISOString()).toBe(NOW.toISOString());
    expect(await prisma.order.count({ where: { brandId: brand.id, shopifyId: { startsWith: "gid://shopify/Order/" } } })).toBe(4); // 3 + o do seedBrand
    const run = await prisma.syncRun.findUniqueOrThrow({ where: { id: r.syncRunId } });
    expect(run).toMatchObject({ kind: "incremental", ordersSeen: 3, ordersFixed: 3, error: null });
    expect(run.finishedAt).not.toBeNull();
    expect((await prisma.brandIntegration.findFirstOrThrow({ where: { brandId: brand.id } })).lastSyncAt?.toISOString()).toBe(NOW.toISOString());
  });

  it("passada seguinte começa no cursor anterior menos 30 min; pedido já igual não conta como corrigido", async () => {
    const brand = await connectedBrand();
    await reconcileBrand(prisma, brand.id, fakeShopify([[order(1)]]).client, { now: NOW });
    const later = new Date(NOW.getTime() + 15 * 60_000);
    const { client, calls } = fakeShopify([[order(1), order(2, "2026-10-09T12:10:00Z")]]);
    const r = await reconcileBrand(prisma, brand.id, client, { now: later });
    expect(calls[0]!.q).toBe(`updated_at:>='${new Date(NOW.getTime() - RECONCILE_MARGIN_MS).toISOString()}'`);
    expect(r).toMatchObject({ ordersSeen: 2, ordersFixed: 1 });
  });

  it("erro do Shopify fica na passada; a próxima ignora a passada com erro", async () => {
    const brand = await connectedBrand();
    await reconcileBrand(prisma, brand.id, fakeShopify([[]]).client, { now: NOW });
    const failing = { shop: "x", graphql: async () => { throw new Error("Shopify respondeu 503."); } } as unknown as ShopifyClient;
    const later = new Date(NOW.getTime() + 15 * 60_000);
    await expect(reconcileBrand(prisma, brand.id, failing, { now: later })).rejects.toThrow("503");
    const failed = await prisma.syncRun.findFirstOrThrow({ where: { brandId: brand.id, error: { not: null } } });
    expect(failed.error).toBe("Shopify respondeu 503.");
    // A janela continua a partir da última passada boa (NOW), não da que falhou.
    const { client, calls } = fakeShopify([[]]);
    await reconcileBrand(prisma, brand.id, client, { now: new Date(later.getTime() + 15 * 60_000) });
    expect(calls[0]!.q).toBe(`updated_at:>='${new Date(NOW.getTime() - RECONCILE_MARGIN_MS).toISOString()}'`);
  });

  it("pedido com muitos itens vira tarefa própria; limite de páginas continua na passada seguinte", async () => {
    const brand = await connectedBrand();
    const big = shopifyOrder({ id: "gid://shopify/Order/900", lineItems: { pageInfo: { hasNextPage: true, endCursor: "x" }, nodes: [] } });
    const pages = Array.from({ length: RECONCILE_MAX_PAGES + 1 }, (_, i) => [order(1000 + i, `2026-10-09T11:${String(31 + i).padStart(2, "0")}:00Z`)]);
    pages[0] = [big, ...pages[0]!];
    const { client, calls } = fakeShopify(pages);
    const r = await reconcileBrand(prisma, brand.id, client, { now: NOW });
    expect(calls).toHaveLength(RECONCILE_MAX_PAGES);
    expect(r.deferred).toBe(1);
    expect(await prisma.job.count({ where: { brandId: brand.id, type: "shopify.order.sync" } })).toBe(1);
    const lastSeen = `2026-10-09T11:${String(31 + RECONCILE_MAX_PAGES - 1).padStart(2, "0")}:00.000Z`;
    expect(new Date(r.cursor.getTime() - RECONCILE_MARGIN_MS).toISOString()).toBe(lastSeen);
  });
});

describe("agendamento e sincronizar agora", () => {
  it("uma reconciliação por marca conectada a cada 15 min", async () => {
    const brand = await connectedBrand();
    const t = new Date("2026-10-09T13:00:30Z");
    await enqueueDueReconciles(prisma, t);
    await enqueueDueReconciles(prisma, new Date("2026-10-09T13:14:00Z"));
    expect(await prisma.job.count({ where: { brandId: brand.id, type: "shopify.reconcile" } })).toBe(1);
    await enqueueDueReconciles(prisma, new Date("2026-10-09T13:15:00Z"));
    expect(await prisma.job.count({ where: { brandId: brand.id, type: "shopify.reconcile" } })).toBe(2);
  });

  it("só super admin pede sincronizar agora; um pedido por minuto; fica na auditoria", async () => {
    const brand = await connectedBrand();
    const adminId = randomUUID();
    await prisma.user.create({ data: { id: adminId, email: `${adminId}@x.com`, name: "SA", roleGrants: { create: { role: "SUPER_ADMIN" } } } });
    const gestaoId = randomUUID();
    await prisma.user.create({ data: { id: gestaoId, email: `${gestaoId}@x.com`, name: "G", roleGrants: { create: { role: "GESTAO", brandId: brand.id } } } });

    await expect(requestSyncNow(prisma, await loadActor(prisma, gestaoId), brand.id, NOW)).rejects.toThrow(/Sem permissão/);
    await expect(requestSyncNow(prisma, null, brand.id, NOW)).rejects.toThrow(/Sem permissão/);
    const admin = await loadActor(prisma, adminId);
    expect(await requestSyncNow(prisma, admin, brand.id, NOW)).toBe(true);
    expect(await requestSyncNow(prisma, admin, brand.id, new Date(NOW.getTime() + 30_000))).toBe(false);
    expect(await prisma.auditLog.count({ where: { action: "sync.request", entityId: brand.id } })).toBe(1);
  });
});
