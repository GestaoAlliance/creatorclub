import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { dayKey } from "@/domain";
import { productReport } from "@/lib/reports/products";
import { freightToCents } from "@/lib/shipments/shipments";
import type { ShopifyClient } from "@/lib/shopify/client";
import { saveShopifyCredentials } from "@/lib/shopify/credentials";
import { syncProducts } from "@/lib/shopify/products";
import { commissionEntry, expectDbError, seedBrand, testClient } from "./fixtures";

const prisma = testClient();
afterAll(() => prisma.$disconnect());

const NOW = new Date();
const today = dayKey(NOW);
const period = { from: today, to: today, preset: "" };

function fakeShopify(nodes: unknown[]) {
  const queries: string[] = [];
  const client = { shop: "x", graphql: async (q: string) => (queries.push(q), { products: { nodes, pageInfo: { hasNextPage: false, endCursor: null } } }) } as unknown as ShopifyClient;
  return { client, queries };
}

describe("produtos e custo (M3.2, D-COST, banco real)", () => {
  it("custo só com read_inventory; receita, custo e margem por produto; lucro do programa com comissão, kits e frete", async () => {
    const a = await seedBrand(prisma);
    const [pa, pb] = [`gid://shopify/Product/${randomUUID()}`, `gid://shopify/Product/${randomUUID()}`];
    const nodes = [
      { id: pa, title: "Sérum", status: "ACTIVE", variants: { nodes: [{ inventoryItem: { unitCost: { amount: "20.00" } } }] } },
      { id: pb, title: "Tônico", status: "ACTIVE", variants: { nodes: [{ inventoryItem: { unitCost: null } }] } },
    ];
    // Sem a permissão: não pede o custo.
    await saveShopifyCredentials(prisma, { brandId: a.brand.id, shop: `${a.brand.slug}.myshopify.com`, clientId: "t", clientSecret: "w", scopes: "read_orders,read_products" }, randomBytes(32));
    const without = fakeShopify(nodes);
    await syncProducts(prisma, a.brand.id, without.client, NOW);
    expect(without.queries[0]).not.toContain("unitCost");
    expect((await prisma.product.findFirstOrThrow({ where: { shopifyId: pa } })).costCents).toBeNull();
    // Com a permissão: grava o custo.
    await prisma.brandIntegration.updateMany({ where: { brandId: a.brand.id, kind: "SHOPIFY" }, data: { scopes: "read_orders,read_products,read_inventory" } });
    const withCost = fakeShopify(nodes);
    expect(await syncProducts(prisma, a.brand.id, withCost.client, NOW)).toMatchObject({ updated: 1 });
    expect(withCost.queries[0]).toContain("unitCost");
    expect(await prisma.product.findFirstOrThrow({ where: { shopifyId: pa } })).toMatchObject({ costCents: 2_000, costSyncedAt: NOW });

    // Pedido de creator pago hoje: 2 sérum (por id) + 1 tônico (linha antiga, casa pelo nome, sem custo).
    const order = await prisma.order.create({
      data: { brandId: a.brand.id, shopifyId: `gid://shopify/Order/${randomUUID()}`, name: "#c", createdAtShop: NOW, paidAt: NOW, financialStatus: "PAID", subtotalCents: 15_000, totalCents: 15_000, discountCodes: [a.coupon.code], shopifyUpdatedAt: NOW },
    });
    await prisma.orderLine.createMany({
      data: [
        { brandId: a.brand.id, orderId: order.id, shopifyId: "l1", title: "Sérum antigo nome", quantity: 2, discountedTotalCents: 10_000, productShopifyId: pa },
        { brandId: a.brand.id, orderId: order.id, shopifyId: "l2", title: "tônico", quantity: 1, discountedTotalCents: 5_000 },
      ],
    });
    await prisma.orderAttribution.create({ data: { brandId: a.brand.id, orderId: order.id, creatorId: a.creator.id, couponId: a.coupon.id, rateBps: 1500, rule: "first_creator_code", evidenceCodes: [a.coupon.code] } });
    await prisma.ledgerEntry.create({ data: commissionEntry({ brandId: a.brand.id, creatorId: a.creator.id, orderId: order.id }, { amountCents: 2_250 }) });
    // Pedido sem creator: só na loja inteira.
    const store = await prisma.order.create({
      data: { brandId: a.brand.id, shopifyId: `gid://shopify/Order/${randomUUID()}`, name: "#s", createdAtShop: NOW, paidAt: NOW, financialStatus: "PAID", subtotalCents: 5_000, totalCents: 5_000, discountCodes: [], shopifyUpdatedAt: NOW },
    });
    await prisma.orderLine.create({ data: { brandId: a.brand.id, orderId: store.id, shopifyId: "l3", title: "Sérum", quantity: 1, discountedTotalCents: 5_000, productShopifyId: pa } });
    // Kit enviado hoje: 1 sérum (custo 20) com frete 23,90; outro envio sem frete.
    const product = await prisma.product.findFirstOrThrow({ where: { shopifyId: pa } });
    for (const freight of [2_390, null]) {
      const s = await prisma.shipment.create({ data: { brandId: a.brand.id, creatorId: a.creator.id, address: {}, createdById: "x", status: "SHIPPED", shippedAt: NOW, shippedById: "x", carrier: "Correios", trackingCode: "AA1", freightCents: freight } });
      await prisma.shipmentItem.create({ data: { brandId: a.brand.id, shipmentId: s.id, productId: product.id, title: "Sérum", quantity: 1 } });
    }

    const r = await productReport(prisma, a.brand.id, period);
    expect(r.rows).toEqual([
      expect.objectContaining({ title: "Sérum", units: 2, orders: 1, revenueCents: 10_000, unitCostCents: 2_000, costCents: 4_000, marginCents: 6_000 }),
      expect.objectContaining({ title: "Tônico", units: 1, revenueCents: 5_000, unitCostCents: null, costCents: null, marginCents: null }),
    ]);
    expect(r.totals).toMatchObject({ orders: 1, revenueCents: 15_000, cogsCents: 4_000, unitsWithoutCost: 1 });
    expect(r.program).toEqual({
      revenueCents: 15_000, cogsCents: 4_000, commissionCents: 2_250, kitsCents: 4_000, freightCents: 2_390,
      profitCents: 15_000 - 4_000 - 2_250 - 4_000 - 2_390, shipments: 2, shipmentsWithoutFreight: 1, kitUnitsWithoutCost: 0,
    });
    const all = await productReport(prisma, a.brand.id, period, "loja");
    expect(all.rows.find((x) => x.title === "Sérum")).toMatchObject({ units: 3, revenueCents: 15_000 });
    expect(all.program).toBeNull();

    await expectDbError(prisma.product.update({ where: { id: product.id }, data: { costCents: -1 } }), /Product_cost_not_negative/);
    await expectDbError(prisma.shipment.updateMany({ where: { brandId: a.brand.id }, data: { freightCents: -5 } }), /Shipment_freight_not_negative/);
  });

  it("frete digitado: vírgula, milhar, vazio; inválido recusa", () => {
    expect(freightToCents("23,90")).toBe(2_390);
    expect(freightToCents("R$ 1.234,5")).toBe(123_450);
    expect(freightToCents("15")).toBe(1_500);
    expect(freightToCents("")).toBeNull();
    expect(() => freightToCents("-3")).toThrow(/Frete inválido/);
  });
});
