import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { loadActor } from "@/lib/auth/actor";
import type { ShopifyClient } from "@/lib/shopify/client";
import { connectShopifyStore } from "@/lib/shopify/connect";
import { loadShopifyConnection, saveShopifyCredentials } from "@/lib/shopify/credentials";
import { syncHealth } from "@/lib/shopify/health";
import { seedBrand, testClient } from "./fixtures";

const prisma = testClient();
afterAll(() => prisma.$disconnect());
const encKey = randomBytes(32);

async function superAdmin() {
  const id = randomUUID();
  await prisma.user.create({ data: { id, email: `${id}@x.com`, name: "SA", roleGrants: { create: { role: "SUPER_ADMIN" } } } });
  return (await loadActor(prisma, id))!;
}

const tokenFetch = (scope: string) =>
  (async () => new Response(JSON.stringify({ access_token: "tok", scope, expires_in: 86399 }), { status: 200 })) as unknown as typeof fetch;

function fakeClient(opts: { existing?: Array<{ topic: string; uri: string }>; taxesIncluded?: boolean } = {}) {
  const created: Array<Record<string, unknown>> = [];
  const client = (shop: string) =>
    ({
      shop,
      graphql: async (q: string, vars: Record<string, unknown>) => {
        if (q.includes("query Shop")) return { shop: { myshopifyDomain: shop, taxesIncluded: opts.taxesIncluded ?? false, currencyCode: "BRL" } };
        if (q.includes("query Subs")) return { webhookSubscriptions: { nodes: opts.existing ?? [] } };
        created.push(vars);
        return { webhookSubscriptionCreate: { userErrors: [] } };
      },
    }) as unknown as ShopifyClient;
  return { client, created };
}

describe("conectar loja (banco real)", () => {
  it("confere credenciais, grava cifrado, cadastra os 5 webhooks e audita", async () => {
    const admin = await superAdmin();
    const { brand } = await seedBrand(prisma);
    const { client, created } = fakeClient({ existing: [{ topic: "ORDERS_PAID", uri: `https://app.test/api/webhooks/shopify/${brand.slug}` }] });
    const r = await connectShopifyStore(
      prisma,
      admin,
      { brandId: brand.id, shop: "loja-dev.myshopify.com", clientId: " cid ", clientSecret: " csec ", appUrl: "https://app.test/" },
      { fetch: tokenFetch("read_orders"), client, encKey },
    );
    expect(r).toMatchObject({ shop: "loja-dev.myshopify.com", webhooksCreated: 4, warnings: [] });
    expect(r.missingRecommended).toEqual(["read_all_orders"]);
    expect(created.map((c) => c.topic)).toEqual(["ORDERS_CREATE", "ORDERS_UPDATED", "ORDERS_CANCELLED", "REFUNDS_CREATE"]);
    expect(created[0]!.uri).toBe(`https://app.test/api/webhooks/shopify/${brand.slug}`);
    expect(await loadShopifyConnection(prisma, brand.id, encKey)).toMatchObject({ clientId: "cid", clientSecret: "csec", scopes: "read_orders" });
    expect(await prisma.auditLog.count({ where: { action: "integration.connect", entityId: brand.id } })).toBe(1);
  });

  it("reconectar com Client ID/secret em branco reaproveita os guardados (mesmo com a loja desconectada)", async () => {
    const admin = await superAdmin();
    const { brand } = await seedBrand(prisma);
    await saveShopifyCredentials(prisma, { brandId: brand.id, shop: "loja-dev.myshopify.com", clientId: "cid-salvo", clientSecret: "csec-salvo", status: "DISCONNECTED" }, encKey);
    expect(await loadShopifyConnection(prisma, brand.id, encKey)).toBeNull();
    let sent = "";
    const fetchSpy = (async (_url: string, init: RequestInit) => {
      sent = String(init.body);
      return new Response(JSON.stringify({ access_token: "tok", scope: "read_orders,read_all_orders", expires_in: 86399 }), { status: 200 });
    }) as unknown as typeof fetch;
    const r = await connectShopifyStore(
      prisma,
      admin,
      { brandId: brand.id, shop: "loja-dev.myshopify.com", clientId: "", clientSecret: " ", appUrl: "https://app.test" },
      { fetch: fetchSpy, client: fakeClient().client, encKey },
    );
    expect(new URLSearchParams(sent).get("client_secret")).toBe("csec-salvo");
    expect(r.missingRecommended).toEqual([]);
    expect(await loadShopifyConnection(prisma, brand.id, encKey)).toMatchObject({ clientId: "cid-salvo", scopes: "read_orders,read_all_orders" });

    const { brand: empty } = await seedBrand(prisma);
    await expect(
      connectShopifyStore(prisma, admin, { brandId: empty.id, shop: "x.myshopify.com", appUrl: "https://app.test" }, { fetch: fetchSpy, client: fakeClient().client, encKey }),
    ).rejects.toThrow(/Informe o Client ID/);
  });

  it("app não instalado na loja dá mensagem clara", async () => {
    const admin = await superAdmin();
    const { brand } = await seedBrand(prisma);
    const notInstalled = (async () =>
      new Response('{"error":"app_not_installed","error_description":"The application is not installed on this shop."}', { status: 400 })) as unknown as typeof fetch;
    await expect(
      connectShopifyStore(prisma, admin, { brandId: brand.id, shop: "x.myshopify.com", clientId: "c", clientSecret: "s", appUrl: "https://a" }, { fetch: notInstalled, client: fakeClient().client, encKey }),
    ).rejects.toThrow("O app ainda não está instalado nesta loja.");
  });

  it("sem read_orders ou sem ser super admin não conecta nada", async () => {
    const admin = await superAdmin();
    const { brand } = await seedBrand(prisma);
    const input = { brandId: brand.id, shop: "loja-dev.myshopify.com", clientId: "c", clientSecret: "s", appUrl: "https://app.test" };
    await expect(connectShopifyStore(prisma, admin, input, { fetch: tokenFetch("read_products"), client: fakeClient().client, encKey })).rejects.toThrow(/read_orders/);
    await expect(connectShopifyStore(prisma, null, input, { fetch: tokenFetch("read_orders"), client: fakeClient().client, encKey })).rejects.toThrow(/Sem permissão/);
    expect(await prisma.brandIntegration.count({ where: { brandId: brand.id } })).toBe(0);
  });

  it("avisa quando a loja usa imposto incluso", async () => {
    const admin = await superAdmin();
    const { brand } = await seedBrand(prisma);
    const r = await connectShopifyStore(
      prisma,
      admin,
      { brandId: brand.id, shop: "loja-dev.myshopify.com", clientId: "c", clientSecret: "s", appUrl: "https://app.test" },
      { fetch: tokenFetch("read_orders"), client: fakeClient({ taxesIncluded: true }).client, encKey },
    );
    expect(r.warnings[0]).toMatch(/imposto incluso/);
  });
});

describe("tela de saúde", () => {
  it("super admin vê todas as marcas com loja, passadas, falhas e avisos; Gestão não vê", async () => {
    const admin = await superAdmin();
    const { brand, order } = await seedBrand(prisma);
    await prisma.syncRun.create({ data: { brandId: brand.id, kind: "incremental", finishedAt: new Date(), ordersSeen: 3 } });
    await prisma.job.create({ data: { brandId: brand.id, type: "shopify.order.sync", payload: {}, status: "FAILED", lastError: "503", finishedAt: new Date() } });
    await prisma.auditLog.create({ data: { brandId: brand.id, actorType: "JOB", action: "order.warning", entity: "Order", entityId: order.id, after: { warnings: ["taxes_included"], name: "#1" } } });

    const health = await syncHealth(prisma, admin);
    const mine = health.find((h) => h.brand.id === brand.id)!;
    expect(mine).toMatchObject({ shopify: null, orders: 1, jobs: { failed24h: 1 } });
    expect(mine.runs[0]).toMatchObject({ ordersSeen: 3 });
    expect(mine.jobs.recentFailures[0]).toMatchObject({ lastError: "503" });
    expect(mine.warnings).toHaveLength(1);

    const gid = randomUUID();
    await prisma.user.create({ data: { id: gid, email: `${gid}@x.com`, name: "G", roleGrants: { create: { role: "GESTAO", brandId: brand.id } } } });
    await expect(syncHealth(prisma, (await loadActor(prisma, gid))!)).rejects.toThrow(/Sem permissão/);
  });
});
