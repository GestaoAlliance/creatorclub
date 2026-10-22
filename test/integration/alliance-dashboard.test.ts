import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { allianceDashboard } from "@/lib/staff/alliance-dashboard";
import { seedBrand, testClient } from "./fixtures";

const prisma = testClient();
afterAll(() => prisma.$disconnect());

/** Pedido pago com o cupom da creator da marca, atribuído a ela. */
async function sale(s: Awaited<ReturnType<typeof seedBrand>>, paidAt: string, cents: number) {
  const o = await prisma.order.create({
    data: { brandId: s.brand.id, shopifyId: `gid://shopify/Order/${randomUUID()}`, name: `#${randomUUID().slice(0, 5)}`, createdAtShop: new Date(paidAt), paidAt: new Date(paidAt), financialStatus: "PAID", subtotalCents: cents, totalCents: cents, discountCodes: [s.coupon.code], shopifyUpdatedAt: new Date() },
  });
  await prisma.orderAttribution.create({ data: { brandId: s.brand.id, orderId: o.id, creatorId: s.creator.id, couponId: s.coupon.id, rateBps: 1000, rule: "first", evidenceCodes: [s.coupon.code] } });
}

describe("Todas as marcas (D-ALLBRANDS, banco real)", () => {
  it("soma as marcas, junta os dias e as top creators com a marca, e compara as marcas", async () => {
    const a = await seedBrand(prisma);
    const b = await seedBrand(prisma);
    await sale(a, "2026-10-03T15:00:00Z", 10_000);
    await sale(b, "2026-10-03T18:00:00Z", 30_000);
    await sale(b, "2026-10-05T15:00:00Z", 5_000);
    await sale(a, "2026-09-25T15:00:00Z", 20_000); // período anterior (21 a 30/09)

    const brands = [a.brand, b.brand].map((x) => ({ id: x.id, slug: x.slug, name: x.name, primaryColor: "#123456", secondaryColor: null }));
    const d = await allianceDashboard(prisma, brands, { from: "2026-10-01", to: "2026-10-10", preset: "" });

    expect(d.kpis.sales).toMatchObject({ cents: 45_000, orders: 3, storeShare: 1 });
    expect(d.kpis.sales.change).toBe(125); // 45.000 contra 20.000
    expect(d.kpis.creators).toMatchObject({ sold: 2, active: 2 });
    expect(d.days.find((x) => x.day === "2026-10-03")).toMatchObject({ count: 2, baseCents: 40_000 });
    expect(d.topCreators.map((c) => [c.brandSlug, c.salesCents])).toEqual([[b.brand.slug, 35_000], [a.brand.slug, 10_000]]);
    expect(d.brands.map((x) => [x.slug, x.salesCents, x.orders])).toEqual([[b.brand.slug, 35_000, 2], [a.brand.slug, 10_000, 1]]);
    expect(d.concentration.top1).toBeCloseTo(35_000 / 45_000);
  });
});
