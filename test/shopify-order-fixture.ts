import type { ShopifyOrderNode } from "@/lib/shopify/orders";

const money = (amount: string) => ({ shopMoney: { amount } });

/** Pedido de exemplo no formato da GraphQL Admin API (pago com cartão, 2 cupons). */
export function shopifyOrder(overrides: Partial<ShopifyOrderNode> = {}): ShopifyOrderNode {
  return {
    id: "gid://shopify/Order/1001",
    name: "#1001",
    createdAt: "2026-09-30T23:50:00Z",
    updatedAt: "2026-10-01T00:00:00Z",
    cancelledAt: null,
    test: false,
    taxesIncluded: false,
    displayFinancialStatus: "PAID",
    currencyCode: "BRL",
    discountCodes: ["MARIA10", "BOTANIKAFRETE"],
    currentSubtotalPriceSet: money("189.90"),
    currentTotalPriceSet: money("209.80"),
    transactions: [{ kind: "SALE", status: "SUCCESS", processedAt: "2026-09-30T23:49:58Z" }],
    lineItems: {
      pageInfo: { hasNextPage: false, endCursor: null },
      nodes: [
        { id: "gid://shopify/LineItem/1", title: "Sérum", currentQuantity: 2, discountedTotalSet: money("119.90") },
        { id: "gid://shopify/LineItem/2", title: "Sabonete", currentQuantity: 1, discountedTotalSet: money("70") },
      ],
    },
    ...overrides,
  };
}
