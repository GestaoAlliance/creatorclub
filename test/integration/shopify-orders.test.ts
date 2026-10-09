import { afterAll, describe, expect, it } from "vitest";
import type { ClaimedJob } from "@/lib/jobs/queue";
import type { ShopifyClient } from "@/lib/shopify/client";
import { orderSyncHandler } from "@/lib/shopify/jobs";
import { processOrder } from "@/lib/shopify/orders";
import { shopifyOrder } from "../shopify-order-fixture";
import { seedBrand, testClient } from "./fixtures";

const prisma = testClient();
afterAll(() => prisma.$disconnect());

describe("processOrder (banco real)", () => {
  it("cria o pedido com os itens; versão mais nova atualiza; versão igual ou antiga é ignorada", async () => {
    const { brand } = await seedBrand(prisma);
    const v1 = shopifyOrder();
    const created = await processOrder(prisma, brand.id, v1);
    expect(created).toMatchObject({ outcome: "created", warnings: [] });
    const order = await prisma.order.findUniqueOrThrow({ where: { id: created.orderId! }, include: { lines: true } });
    expect(order).toMatchObject({ subtotalCents: 18_990, discountCodes: ["MARIA10", "BOTANIKAFRETE"], financialStatus: "PAID" });
    expect(order.lines).toHaveLength(2);

    // Mesma versão de novo (webhook repetido): nada muda.
    expect((await processOrder(prisma, brand.id, v1)).outcome).toBe("stale");

    // Reembolso parcial: versão nova.
    const v2 = shopifyOrder({
      updatedAt: "2026-10-05T00:00:00Z",
      displayFinancialStatus: "PARTIALLY_REFUNDED",
      currentSubtotalPriceSet: { shopMoney: { amount: "70.00" } },
      lineItems: {
        pageInfo: { hasNextPage: false, endCursor: null },
        nodes: shopifyOrder().lineItems.nodes.map((l, i) => (i === 0 ? { ...l, currentQuantity: 0 } : l)),
      },
    });
    expect(await processOrder(prisma, brand.id, v2)).toMatchObject({ outcome: "updated", orderId: created.orderId });
    // Foto antiga chegando atrasada não desfaz o reembolso.
    expect((await processOrder(prisma, brand.id, v1)).outcome).toBe("stale");

    const after = await prisma.order.findUniqueOrThrow({ where: { id: created.orderId! }, include: { lines: { orderBy: { shopifyId: "asc" } } } });
    expect(after).toMatchObject({ financialStatus: "PARTIALLY_REFUNDED", subtotalCents: 7_000 });
    expect(after.lines.map((l) => l.quantity)).toEqual([0, 1]);
  });

  it("o mesmo pedido em marcas diferentes são pedidos diferentes", async () => {
    const a = await seedBrand(prisma);
    const b = await seedBrand(prisma);
    expect((await processOrder(prisma, a.brand.id, shopifyOrder())).outcome).toBe("created");
    expect((await processOrder(prisma, b.brand.id, shopifyOrder())).outcome).toBe("created");
  });

  it("avisa quando o pedido vem com imposto incluso ou em outra moeda (D-TAX)", async () => {
    const { brand } = await seedBrand(prisma);
    const r = await processOrder(prisma, brand.id, shopifyOrder({ id: "gid://shopify/Order/77", taxesIncluded: true, currencyCode: "USD" }));
    expect(r.warnings).toEqual(["taxes_included", "currency_not_brl"]);
  });

  it("recusa pedido com itens pela metade", async () => {
    const { brand } = await seedBrand(prisma);
    const partial = shopifyOrder({ id: "gid://shopify/Order/88", lineItems: { pageInfo: { hasNextPage: true, endCursor: "x" }, nodes: [] } });
    await expect(processOrder(prisma, brand.id, partial)).rejects.toThrow(/não carregados/);
    expect(await prisma.order.count({ where: { brandId: brand.id, shopifyId: "gid://shopify/Order/88" } })).toBe(0);
  });
});

describe("tarefa shopify.order.sync", () => {
  const job = (brandId: string | null, payload: unknown): ClaimedJob => ({
    id: "job-1",
    brandId,
    type: "shopify.order.sync",
    payload: payload as ClaimedJob["payload"],
    attempts: 1,
    maxAttempts: 8,
  });
  const clientWith = (order: unknown) => async () => ({ shop: "x", graphql: async () => ({ order }) }) as unknown as ShopifyClient;

  it("busca o pedido e grava; aviso de imposto fica na auditoria", async () => {
    const { brand } = await seedBrand(prisma);
    const node = shopifyOrder({ id: "gid://shopify/Order/555", taxesIncluded: true });
    await orderSyncHandler(prisma, clientWith(node))(job(brand.id, { orderGid: node.id }));
    const order = await prisma.order.findUniqueOrThrow({ where: { brandId_shopifyId: { brandId: brand.id, shopifyId: node.id } } });
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { entity: "Order", entityId: order.id } });
    expect(audit).toMatchObject({ action: "order.warning", actorType: "JOB", after: { warnings: ["taxes_included"], name: "#1001" } });
  });

  it("pedido apagado no Shopify termina sem gravar; payload sem pedido falha", async () => {
    const { brand } = await seedBrand(prisma);
    await orderSyncHandler(prisma, clientWith(null))(job(brand.id, { orderGid: "gid://shopify/Order/404" }));
    expect(await prisma.order.count({ where: { brandId: brand.id, shopifyId: "gid://shopify/Order/404" } })).toBe(0);
    await expect(orderSyncHandler(prisma, clientWith(null))(job(brand.id, {}))).rejects.toThrow(/sem pedido/);
    await expect(orderSyncHandler(prisma, clientWith(null))(job(null, { orderGid: "x" }))).rejects.toThrow(/sem marca/);
  });
});
