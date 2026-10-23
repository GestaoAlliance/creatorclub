import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { creatorReturns } from "@/lib/reports/creator-return";
import { processOrder, type ShopifyOrderNode } from "@/lib/shopify/orders";
import { commissionEntry, seedBrand, testClient } from "./fixtures";

const prisma = testClient();
afterAll(() => prisma.$disconnect());

const T = (s: string) => new Date(s);

function node(o: { id: string; created: string; customer?: { id: string } | null; codes?: string[] }): ShopifyOrderNode {
  return {
    id: o.id, name: `#${o.id.slice(-4)}`, createdAt: o.created, updatedAt: o.created, cancelledAt: null, test: false, taxesIncluded: false,
    displayFinancialStatus: "PAID", currencyCode: "BRL", discountCodes: o.codes ?? [],
    currentSubtotalPriceSet: { shopMoney: { amount: "100.00" } }, currentTotalPriceSet: { shopMoney: { amount: "100.00" } },
    transactions: [{ kind: "SALE", status: "SUCCESS", processedAt: o.created }],
    lineItems: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [{ id: `${o.id}-l`, title: "Sérum", currentQuantity: 1, discountedTotalSet: { shopMoney: { amount: "100.00" } }, product: null }] },
    ...(o.customer !== undefined ? { customer: o.customer } : {}),
  };
}

describe("retorno por creator (M3.3, D-RETURN, banco real)", () => {
  it("grava só o id da cliente; sem a permissão não apaga; nova × recorrente; lucro com custo, comissão, kits e frete", async () => {
    const a = await seedBrand(prisma);
    const gid = () => `gid://shopify/Order/${randomUUID()}`;
    const [ana, bia] = [`gid://shopify/Customer/${randomUUID()}`, `gid://shopify/Customer/${randomUUID()}`];
    // Ana já comprou antes (sem cupom) → o pedido com cupom é recorrente. Bia compra pela primeira vez com o cupom.
    await processOrder(prisma, a.brand.id, node({ id: gid(), created: "2026-08-01T12:00:00Z", customer: { id: ana } }));
    const o1 = gid();
    const r1 = await processOrder(prisma, a.brand.id, node({ id: o1, created: "2026-10-05T12:00:00Z", customer: { id: ana }, codes: [a.coupon.code] }));
    const r2 = await processOrder(prisma, a.brand.id, node({ id: gid(), created: "2026-10-06T12:00:00Z", customer: { id: bia }, codes: [a.coupon.code] }));
    // Sem a permissão (campo não vem): o id já gravado fica.
    await processOrder(prisma, a.brand.id, { ...node({ id: o1, created: "2026-10-05T12:00:00Z", codes: [a.coupon.code] }), updatedAt: "2026-10-07T12:00:00Z" });
    expect((await prisma.order.findUniqueOrThrow({ where: { id: r1.orderId! } })).customerShopifyId).toBe(ana);
    // Pedido antigo sem cliente ganha o id quando reimportado com a permissão (mesma versão).
    const o3 = gid();
    const r3 = await processOrder(prisma, a.brand.id, node({ id: o3, created: "2026-10-08T12:00:00Z", codes: [a.coupon.code] }));
    await processOrder(prisma, a.brand.id, node({ id: o3, created: "2026-10-08T12:00:00Z", customer: { id: bia }, codes: [a.coupon.code] }));
    expect((await prisma.order.findUniqueOrThrow({ where: { id: r3.orderId! } })).customerShopifyId).toBe(bia);
    const o4 = await processOrder(prisma, a.brand.id, node({ id: gid(), created: "2026-10-09T12:00:00Z", customer: null, codes: [a.coupon.code] }));

    for (const r of [r1, r2, r3, o4])
      await prisma.orderAttribution.create({ data: { brandId: a.brand.id, orderId: r.orderId!, creatorId: a.creator.id, couponId: a.coupon.id, rateBps: 1500, rule: "first_creator_code", evidenceCodes: [a.coupon.code] } });
    await prisma.ledgerEntry.create({ data: commissionEntry({ brandId: a.brand.id, creatorId: a.creator.id, orderId: r1.orderId! }, { amountCents: 1_500 }) });
    const product = await prisma.product.create({ data: { brandId: a.brand.id, shopifyId: `gid://shopify/Product/${randomUUID()}`, title: "Sérum", costCents: 3_000 } });
    const ship = await prisma.shipment.create({ data: { brandId: a.brand.id, creatorId: a.creator.id, address: {}, createdById: "x", status: "SHIPPED", shippedAt: T("2026-10-10T12:00:00Z"), shippedById: "x", carrier: "C", trackingCode: "A", freightCents: 2_000 } });
    await prisma.shipmentItem.create({ data: { brandId: a.brand.id, shipmentId: ship.id, productId: product.id, title: "Sérum", quantity: 1 } });

    const ret = (await creatorReturns(prisma, a.brand.id, { gte: T("2026-10-01T03:00:00Z"), lt: T("2026-11-01T03:00:00Z") }, [a.creator.id])).get(a.creator.id)!;
    // r3: Bia já tinha comprado em r2 → recorrente. o4: sem cliente.
    expect(ret).toEqual({
      orders: 4, revenueCents: 40_000, cogsCents: 12_000, commissionCents: 1_500, kitsCents: 3_000, freightCents: 2_000,
      profitCents: 40_000 - 12_000 - 1_500 - 3_000 - 2_000, unitsWithoutCost: 0, customers: { new: 1, returning: 2, unknown: 1 },
    });
    // Outra creator e outro período: nada.
    expect((await creatorReturns(prisma, a.brand.id, { gte: T("2026-09-01T03:00:00Z"), lt: T("2026-10-01T03:00:00Z") }, [a.creator.id])).size).toBe(0);
  });
});
