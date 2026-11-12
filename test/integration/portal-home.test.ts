import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { loadActor } from "@/lib/auth/actor";
import { portalContext } from "@/lib/portal/context";
import { portalHomeExtras } from "@/lib/portal/motivation";
import { seedBrand, testClient } from "./fixtures";

const prisma = testClient();
afterAll(() => prisma.$disconnect());

describe("Início do portal (D-PORTALHOME, banco real)", () => {
  it("conquistas, faixa só para quem vendeu e próximos passos da própria creator", async () => {
    const a = await seedBrand(prisma);
    const userId = randomUUID();
    await prisma.user.create({ data: { id: userId, email: `${userId}@x.com`, name: "Creator" } });
    await prisma.creatorAccount.update({ where: { id: a.account.id }, data: { userId, tiktok: "@minha" } });
    const ctx = await portalContext(prisma, (await loadActor(prisma, userId))!, a.brand.slug);
    const now = new Date("2026-09-20T15:00:00Z");

    let x = await portalHomeExtras(prisma, ctx, now);
    expect(x.achievements.every((b) => !b.done)).toBe(true);
    expect(x.band).toBeNull();
    expect(x.steps.map((s) => [s.id, s.done])).toEqual([["tiktok", true], ["birthday", false], ["post", false]]);
    expect(x.tip.length).toBeGreaterThan(10);

    // O pedido do seed (pago em 01/09) com o cupom dela.
    await prisma.orderAttribution.create({ data: { brandId: a.brand.id, orderId: a.order.id, creatorId: a.creator.id, couponId: a.coupon.id, rule: "first_creator_code_v1", evidenceCodes: [a.coupon.code] } });
    // Outra creator ativa da marca, sem venda: ela fica na frente.
    const acc2 = await prisma.creatorAccount.create({ data: { name: "Outra", email: `${randomUUID()}@x.com` } });
    await prisma.creator.create({ data: { brandId: a.brand.id, accountId: acc2.id, categories: ["INFLUENCER"] } });
    x = await portalHomeExtras(prisma, ctx, now);
    expect(x.achievements.find((b) => b.id === "first-sale")?.done).toBe(true);
    expect(x.band).toMatch(/mais venderam/);
  });
});

describe("Vendas do portal (D-PORTALSALES, banco real)", () => {
  it("produtos do pedido e os mais vendidos (sem brinde), período anterior, cliente nova e dias de post", async () => {
    const { portalSalesExtras } = await import("@/lib/portal/sales-extras");
    const a = await seedBrand(prisma);
    const userId = randomUUID();
    await prisma.user.create({ data: { id: userId, email: `${userId}@x.com`, name: "Creator" } });
    await prisma.creatorAccount.update({ where: { id: a.account.id }, data: { userId } });
    const ctx = await portalContext(prisma, (await loadActor(prisma, userId))!, a.brand.slug);
    const mk = async (at: string, cents: number, customer: string | null, lines: [string, number, number][]) => {
      const o = await prisma.order.create({
        data: { brandId: a.brand.id, shopifyId: `gid://shopify/Order/ps-${randomUUID()}`, name: `#ps${randomUUID().slice(0, 5)}`, createdAtShop: new Date(at), paidAt: new Date(at), financialStatus: "PAID", subtotalCents: cents, totalCents: cents, discountCodes: [a.coupon.code], shopifyUpdatedAt: new Date(at), customerShopifyId: customer },
      });
      await prisma.orderAttribution.create({ data: { brandId: a.brand.id, orderId: o.id, creatorId: a.creator.id, couponId: a.coupon.id, rule: "first_creator_code_v1", evidenceCodes: [a.coupon.code] } });
      for (const [title, q, c] of lines) await prisma.orderLine.create({ data: { brandId: a.brand.id, orderId: o.id, shopifyId: randomUUID(), title, quantity: q, discountedTotalCents: c } });
      return o;
    };
    // Cliente C1 já comprou antes (outubro, fora do período e sem ser dela).
    await prisma.order.create({ data: { brandId: a.brand.id, shopifyId: `gid://shopify/Order/old-${randomUUID()}`, name: "#old", createdAtShop: new Date("2026-09-10T12:00:00Z"), financialStatus: "PAID", subtotalCents: 1, totalCents: 1, discountCodes: [], shopifyUpdatedAt: new Date("2026-09-10T12:00:00Z"), customerShopifyId: "C1" } });
    const o1 = await mk("2026-10-05T15:00:00Z", 10_000, "C1", [["Whey", 2, 9_000], ["Brinde", 1, 0]]);
    await mk("2026-10-06T15:00:00Z", 5_000, "C2", [["Creatina", 1, 5_000], ["Whey", 1, 4_000]]);
    await mk("2026-09-29T15:00:00Z", 7_000, null, [["Whey", 1, 7_000]]); // período anterior (7 dias antes)
    await prisma.creatorPost.create({ data: { brandId: a.brand.id, creatorId: a.creator.id, url: "https://instagram.com/p/x", platform: "INSTAGRAM", postedDay: "2026-10-04", createdById: userId } });

    const x = await portalSalesExtras(prisma, ctx, { p: "custom", de: "2026-10-01", ate: "2026-10-07" }, new Date("2026-10-08T15:00:00Z"));
    expect(x.items[o1.id]!.map((i) => i.title)).toEqual(["Whey"]);
    expect(x.top.map((t) => [t.title, t.units])).toEqual([["Whey", 3], ["Creatina", 1]]);
    expect(x.previous.reduce((s, v) => s + v, 0)).toBe(7_000);
    expect(x.customers).toEqual({ new: 1, returning: 1, unknown: 0 });
    expect(x.postDays).toEqual(["2026-10-04"]);
    expect(x.best).toBeNull(); // menos de 3 pedidos
  });
});
