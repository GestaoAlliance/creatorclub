import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { loadActor } from "@/lib/auth/actor";
import { monthPerformance } from "@/lib/creators/performance";
import { letters, seedBrand, testClient } from "./fixtures";

const prisma = testClient();
afterAll(() => prisma.$disconnect());

async function userWith(role: "GESTAO" | "PAGAMENTO", brandId: string) {
  const id = randomUUID();
  await prisma.user.create({ data: { id, email: `${id}@x.com`, name: role, roleGrants: { create: { role, brandId } } } });
  return (await loadActor(prisma, id))!;
}

describe("desempenho do mês (U4, banco real)", () => {
  it("vendas e pedidos do mês, mês anterior, mínimo, kit; UGC à parte; só Gestão", async () => {
    const { brand, creator, coupon } = await seedBrand(prisma);
    const template = await prisma.contractTemplate.create({
      data: { brandId: brand.id, key: `t-${letters(4)}`, name: "t", releaseMinCents: 50_000, months: 6, kitTiers: [{ fromCents: 30_000, products: 1 }, { fromCents: 100_000, products: 2 }] },
    });
    await prisma.creator.update({ where: { id: creator.id }, data: { contractTemplateId: template.id } });
    const acc = await prisma.creatorAccount.create({ data: { name: "Uma UGC", email: `${randomUUID()}@x.com` } });
    const ugc = await prisma.creator.create({ data: { brandId: brand.id, accountId: acc.id, categories: ["UGC"] } });

    const sale = async (who: string, paidAt: string, cents: number) => {
      const o = await prisma.order.create({
        data: { brandId: brand.id, shopifyId: `gid://shopify/Order/${randomUUID()}`, name: `#${letters(5)}`, createdAtShop: new Date(paidAt), paidAt: new Date(paidAt), financialStatus: "PAID", subtotalCents: cents, totalCents: cents, discountCodes: [coupon.code], shopifyUpdatedAt: new Date(paidAt) },
      });
      await prisma.orderAttribution.create({ data: { brandId: brand.id, orderId: o.id, creatorId: who, couponId: coupon.id, rule: "first_creator_code", evidenceCodes: [coupon.code] } });
    };
    await sale(creator.id, "2026-10-05T15:00:00Z", 20_000);
    await sale(creator.id, "2026-10-06T15:00:00Z", 15_000);
    await sale(creator.id, "2026-09-10T15:00:00Z", 10_000);
    await sale(ugc.id, "2026-10-07T15:00:00Z", 9_000);

    const gestao = await userWith("GESTAO", brand.id);
    const now = new Date("2026-10-20T12:00:00Z");
    const d = await monthPerformance(prisma, gestao, brand.id, {}, now);
    expect(d.month).toBe("2026-10");
    const row = d.partners.find((r) => r.id === creator.id)!;
    expect(row).toMatchObject({
      salesCents: 35_000, orders: 2, prevSalesCents: 10_000, changeBps: 25_000,
      release: { accumulatedCents: 45_000, minCents: 50_000 },
      kit: { products: 1, nextFromCents: 100_000, nextProducts: 2, missingCents: 65_000 },
    });
    expect(d.ugc.map((r) => r.id)).toEqual([ugc.id]);
    expect(d.partners.some((r) => r.id === ugc.id)).toBe(false);
    expect(d.summary).toMatchObject({ salesCents: 44_000, prevSalesCents: 10_000, orders: 3, active: 1, sellers: 1, reachedMin: 0 });

    const sep = await monthPerformance(prisma, gestao, brand.id, { month: "2026-09" }, now);
    expect(sep.partners.find((r) => r.id === creator.id)).toMatchObject({ salesCents: 10_000, orders: 1, prevSalesCents: 0, changeBps: null });
    expect((await monthPerformance(prisma, gestao, brand.id, { month: "2020-01" }, now)).month).toBe("2026-10");
    await expect(monthPerformance(prisma, await userWith("PAGAMENTO", brand.id), brand.id, {}, now)).rejects.toThrow(/permissão/);
  });
});
