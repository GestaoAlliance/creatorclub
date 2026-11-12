import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import type { PortalContext } from "@/lib/portal/context";
import { portalPostsBoard } from "@/lib/portal/posts-board";
import { commissionEntry, seedBrand, testClient } from "./fixtures";

const prisma = testClient();
afterAll(() => prisma.$disconnect());
const T = (s: string) => new Date(s);

describe("Meus posts no portal (D-PORTALPOSTS, banco real)", () => {
  it("registrados + detectados sem repetir, comissão e pedidos em 3 dias (sem total vendido), resumo e campeões", async () => {
    const { brand, creator, account, coupon } = await seedBrand(prisma);
    await prisma.creatorAccount.update({ where: { id: account.id }, data: { instagram: "@Julia.Teste" } });
    const ctx = { creatorId: creator.id, brand: { id: brand.id, name: brand.name, slug: brand.slug }, viewAs: null } as unknown as PortalContext;
    // Registrado (reel) em 03/11; detectado o mesmo reel (não repete) e outro detectado em 06/11; de outra pessoa não entra.
    await prisma.creatorPost.create({ data: { brandId: brand.id, creatorId: creator.id, url: "https://www.instagram.com/reel/AAA/", platform: "INSTAGRAM", postedDay: "2026-11-03", createdById: "u" } });
    await prisma.instagramTag.createMany({
      data: [
        { brandId: brand.id, mediaId: "m1", username: "julia.teste", postedAt: T("2026-11-03T15:00:00Z"), permalink: "https://www.instagram.com/reel/AAA/", likes: 40, comments: 3 },
        { brandId: brand.id, mediaId: "m2", username: "JULIA.TESTE", postedAt: T("2026-11-06T15:00:00Z"), permalink: "https://www.instagram.com/p/BBB/", likes: 10, comments: 1 },
        { brandId: brand.id, mediaId: "m3", username: "outra", postedAt: T("2026-11-06T15:00:00Z"), permalink: "https://www.instagram.com/p/CCC/" },
      ],
    });
    // Pedidos: 2 na janela do reel (03 a 05/11), 1 na do post de 06/11.
    const order = async (cents: number, commission: number, paidAt: string) => {
      const o = await prisma.order.create({ data: { brandId: brand.id, shopifyId: `gid://shopify/Order/${randomUUID()}`, name: "#p", createdAtShop: T(paidAt), paidAt: T(paidAt), financialStatus: "PAID", subtotalCents: cents, totalCents: cents, discountCodes: [coupon.code], shopifyUpdatedAt: T(paidAt) } });
      await prisma.orderAttribution.create({ data: { brandId: brand.id, orderId: o.id, creatorId: creator.id, couponId: coupon.id, rateBps: 1500, rule: "FIRST_CREATOR_CODE", evidenceCodes: [coupon.code] } });
      await prisma.ledgerEntry.create({ data: commissionEntry({ brandId: brand.id, creatorId: creator.id, orderId: o.id }, { amountCents: commission, baseCents: cents }) });
    };
    await order(10_000, 1_500, "2026-11-03T18:00:00Z");
    await order(20_000, 3_000, "2026-11-05T18:00:00Z");
    await order(6_000, 900, "2026-11-07T18:00:00Z");

    const b = await portalPostsBoard(prisma, ctx, T("2026-11-12T15:00:00Z"));
    expect(b.posts.map((p) => [p.source, p.postedDay, p.format, p.likes, p.commissionCents, p.orders])).toEqual([
      ["INSTAGRAM", "2026-11-06", "Foto ou carrossel", 10, 900, 1],
      ["MANUAL", "2026-11-03", "Reels", 40, 4_500, 2],
    ]);
    expect(b.posts[1]).not.toHaveProperty("windowCents"); // nada de total vendido
    expect(b.summary).toMatchObject({ monthPosts: 2, lastDay: "2026-11-06", daysSince: 6 });
    expect(b.summary.bestOfMonth?.postedDay).toBe("2026-11-03");
    expect(b.top.map((p) => p.commissionCents)).toEqual([4_500, 900]);
    expect(b.streak.streak).toBe(1); // semana de 02/11 (a atual, de 09/11, ainda sem post)
    expect(b.ideas).toHaveLength(3);
  });
});
