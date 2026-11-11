import { afterAll, describe, expect, it } from "vitest";
import { baseHealth, cashflow } from "@/lib/staff/insights";
import { commissionEntry, seedBrand, testClient } from "./fixtures";

const prisma = testClient();
afterAll(() => prisma.$disconnect());

describe("insights do Início (D-HOMEINSIGHTS, banco real)", () => {
  it("saúde da base: parada, nunca vendeu, vendendo e primeira venda no período; caixa a liberar", async () => {
    const s = await seedBrand(prisma);
    await prisma.orderAttribution.create({ data: { brandId: s.brand.id, orderId: s.order.id, creatorId: s.creator.id, couponId: s.coupon.id, rule: "FIRST_CREATOR", evidenceCodes: [s.coupon.code] } });
    const other = await prisma.creator.create({ data: { brandId: s.brand.id, accountId: (await prisma.creatorAccount.create({ data: { name: "Outra Exemplo", email: `${s.brand.id}@x.com` } })).id, categories: ["INFLUENCER"] } });
    const now = new Date("2026-11-11T12:00:00Z");
    const h = await baseHealth(prisma, s.brand.id, "", { gte: new Date("2026-08-15T00:00:00Z"), lt: new Date("2026-09-15T00:00:00Z") }, now);
    expect(h).toMatchObject({ active: 2, selling: 0, stopped: 1, neverSold: 1, firstSaleCount: 1 });
    expect(h.firstSales[0]).toMatchObject({ id: s.creator.id });
    expect((await baseHealth(prisma, s.brand.id, "", { gte: now, lt: now }, new Date("2026-09-10T00:00:00Z")))).toMatchObject({ selling: 1, stopped: 0 });
    void other;

    await prisma.ledgerEntry.create({ data: commissionEntry({ brandId: s.brand.id, creatorId: s.creator.id, orderId: s.order.id }, { availableAt: new Date("2026-12-01T03:00:00Z") }) });
    const c = await cashflow(prisma, s.brand.id, now);
    expect(c.heldCents + c.availableCents + c.lockedCents).toBe(3_000);
    expect(c.requested).toEqual({ count: 0, cents: 0 });
  });
});
