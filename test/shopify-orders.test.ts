import { describe, expect, it } from "vitest";
import type { ShopifyClient } from "@/lib/shopify/client";
import { fetchOrder, mapShopifyOrder, paidAtOf } from "@/lib/shopify/orders";
import { shopifyOrder } from "./shopify-order-fixture";

describe("pedido do Shopify → Order", () => {
  it("converte valores para centavos, mantém a ordem dos cupons e a data do pagamento", () => {
    const { order, lines } = mapShopifyOrder(shopifyOrder(), "marca-1");
    expect(order).toMatchObject({
      brandId: "marca-1",
      shopifyId: "gid://shopify/Order/1001",
      name: "#1001",
      financialStatus: "PAID",
      subtotalCents: 18_990,
      totalCents: 20_980,
      currency: "BRL",
      discountCodes: ["MARIA10", "BOTANIKAFRETE"],
      taxesIncluded: false,
      test: false,
      cancelledAt: null,
    });
    expect(order.paidAt?.toISOString()).toBe("2026-09-30T23:49:58.000Z");
    expect(order.shopifyUpdatedAt.toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(lines).toEqual([
      { shopifyId: "gid://shopify/LineItem/1", title: "Sérum", quantity: 2, discountedTotalCents: 11_990 },
      { shopifyId: "gid://shopify/LineItem/2", title: "Sabonete", quantity: 1, discountedTotalCents: 7_000 },
    ]);
  });

  it("reembolso parcial, cancelado e teste vêm como o Shopify manda", () => {
    const refunded = mapShopifyOrder(
      shopifyOrder({ displayFinancialStatus: "PARTIALLY_REFUNDED", currentSubtotalPriceSet: { shopMoney: { amount: "70.00" } } }),
      "m",
    ).order;
    expect(refunded).toMatchObject({ financialStatus: "PARTIALLY_REFUNDED", subtotalCents: 7_000 });

    const cancelled = mapShopifyOrder(shopifyOrder({ cancelledAt: "2026-10-02T10:00:00Z", displayFinancialStatus: "REFUNDED" }), "m").order;
    expect(cancelled.cancelledAt?.toISOString()).toBe("2026-10-02T10:00:00.000Z");
    expect(mapShopifyOrder(shopifyOrder({ test: true }), "m").order.test).toBe(true);
  });

  it("data do pagamento: primeira SALE ou CAPTURE com sucesso; Pix pendente não está pago", () => {
    expect(paidAtOf([{ kind: "SALE", status: "PENDING", processedAt: "2026-10-01T10:00:00Z" }])).toBeNull();
    expect(paidAtOf([{ kind: "AUTHORIZATION", status: "SUCCESS", processedAt: "2026-10-01T10:00:00Z" }])).toBeNull();
    expect(
      paidAtOf([
        { kind: "AUTHORIZATION", status: "SUCCESS", processedAt: "2026-10-01T10:00:00Z" },
        { kind: "SALE", status: "FAILURE", processedAt: "2026-10-01T09:00:00Z" },
        { kind: "CAPTURE", status: "SUCCESS", processedAt: "2026-10-03T12:00:00Z" },
        { kind: "REFUND", status: "SUCCESS", processedAt: "2026-10-04T12:00:00Z" },
      ])?.toISOString(),
    ).toBe("2026-10-03T12:00:00.000Z");
  });

  it("busca todas as páginas de itens do pedido", async () => {
    const page1 = shopifyOrder({
      lineItems: { pageInfo: { hasNextPage: true, endCursor: "c1" }, nodes: shopifyOrder().lineItems.nodes.slice(0, 1) },
    });
    const page2 = shopifyOrder({
      lineItems: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: shopifyOrder().lineItems.nodes.slice(1) },
    });
    const calls: unknown[] = [];
    const client = {
      shop: "x.myshopify.com",
      graphql: async (_q: string, vars: unknown) => {
        calls.push(vars);
        return { order: calls.length === 1 ? page1 : page2 };
      },
    } as unknown as ShopifyClient;
    const order = await fetchOrder(client, "gid://shopify/Order/1001");
    expect(order?.lineItems.nodes.map((l) => l.title)).toEqual(["Sérum", "Sabonete"]);
    expect(order?.lineItems.pageInfo.hasNextPage).toBe(false);
    expect(calls).toEqual([
      { id: "gid://shopify/Order/1001", after: null },
      { id: "gid://shopify/Order/1001", after: "c1" },
    ]);
  });

  it("pedido que não existe no Shopify devolve null", async () => {
    const client = { shop: "x", graphql: async () => ({ order: null }) } as unknown as ShopifyClient;
    expect(await fetchOrder(client, "gid://shopify/Order/9")).toBeNull();
  });
});
