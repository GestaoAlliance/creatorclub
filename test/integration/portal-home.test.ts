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
