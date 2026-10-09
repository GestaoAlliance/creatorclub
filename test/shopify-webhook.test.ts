import { describe, expect, it } from "vitest";
import { orderGidFromPayload, shopifyHmac, verifyShopifyHmac } from "@/lib/shopify/webhook";

const body = Buffer.from('{"id":820982911946154508,"admin_graphql_api_id":"gid://shopify/Order/820982911946154508"}');

describe("assinatura do webhook do Shopify", () => {
  it("aceita a assinatura certa e recusa corpo alterado, outra chave ou cabeçalho ausente", () => {
    const sig = shopifyHmac(body, "chave-do-app");
    expect(verifyShopifyHmac(body, "chave-do-app", sig)).toBe(true);
    expect(verifyShopifyHmac(Buffer.from(body.toString().replace("8", "9")), "chave-do-app", sig)).toBe(false);
    expect(verifyShopifyHmac(body, "outra-chave", sig)).toBe(false);
    expect(verifyShopifyHmac(body, "chave-do-app", null)).toBe(false);
    expect(verifyShopifyHmac(body, "chave-do-app", "curto")).toBe(false);
    expect(verifyShopifyHmac(body, "", sig)).toBe(false);
  });

  it("usa o corpo cru byte a byte (JSON reformatado não passa)", () => {
    const sig = shopifyHmac(body, "k");
    const reformatted = Buffer.from(JSON.stringify(JSON.parse(body.toString()), null, 2));
    expect(verifyShopifyHmac(reformatted, "k", sig)).toBe(false);
  });
});

describe("pedido a que o aviso se refere", () => {
  it("pedidos: usa o GID; sem ele, monta pelo id numérico", () => {
    expect(orderGidFromPayload("orders/paid", { admin_graphql_api_id: "gid://shopify/Order/1" })).toBe("gid://shopify/Order/1");
    expect(orderGidFromPayload("orders/updated", { id: 42 })).toBe("gid://shopify/Order/42");
    expect(orderGidFromPayload("orders/updated", { admin_graphql_api_id: "gid://shopify/Product/1" })).toBeNull();
  });

  it("reembolso: usa o order_id; corpo inválido não vira pedido", () => {
    expect(orderGidFromPayload("refunds/create", { id: 9, order_id: 42 })).toBe("gid://shopify/Order/42");
    expect(orderGidFromPayload("refunds/create", { id: 9 })).toBeNull();
    expect(orderGidFromPayload("orders/create", null)).toBeNull();
    expect(orderGidFromPayload("orders/create", { id: "1; drop" })).toBeNull();
  });
});
