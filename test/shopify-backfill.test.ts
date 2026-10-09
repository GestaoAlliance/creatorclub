import { describe, expect, it } from "vitest";
import { bulkOrdersQuery, parseBulkOrders } from "@/lib/shopify/backfill";
import { mapShopifyOrder } from "@/lib/shopify/orders";
import { shopifyOrder, toJsonl } from "./shopify-order-fixture";

describe("carga histórica: arquivo da Bulk Operation", () => {
  it("remonta cada pedido com seus itens, na ordem do arquivo", () => {
    const a = shopifyOrder();
    const b = shopifyOrder({ id: "gid://shopify/Order/2", name: "#2", lineItems: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [] } });
    const parsed = parseBulkOrders(`${toJsonl([a, b])}\n`);
    expect(parsed.map((o) => o.name)).toEqual(["#1001", "#2"]);
    expect(parsed[0]!.lineItems.nodes.map((l) => l.title)).toEqual(["Sérum", "Sabonete"]);
    expect(parsed[0]!.lineItems.nodes[0]).not.toHaveProperty("__parentId");
    expect(mapShopifyOrder(parsed[0]!, "m")).toEqual(mapShopifyOrder(a, "m"));
  });

  it("item sem pedido no arquivo é erro", () => {
    expect(() => parseBulkOrders('{"id":"gid://shopify/LineItem/1","__parentId":"gid://shopify/Order/9"}')).toThrow(/sem pedido/);
  });

  it("consulta filtra pela data de criação", () => {
    expect(bulkOrdersQuery(new Date("2026-07-21T03:00:00Z"))).toContain(`created_at:>='2026-07-21T03:00:00.000Z'`);
  });
});
