import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { loadActor } from "@/lib/auth/actor";
import { creatorProfile, listCreators } from "@/lib/creators/profile";
import { staffHome } from "@/lib/staff/home";
import { seedBrand, testClient } from "./fixtures";

const prisma = testClient();
afterAll(() => prisma.$disconnect());

const ago = (days: number) => new Date(Date.now() - days * 86_400_000);

describe("aviso de 60 dias sem vender (D-IDLE60, banco real)", () => {
  it("última venda elegível conta; nunca vendeu conta do início; pausada e permuta ficam de fora", async () => {
    const a = await seedBrand(prisma);
    const gid = randomUUID();
    await prisma.user.create({ data: { id: gid, email: `${gid}@x.com`, name: "G", roleGrants: { create: { role: "GESTAO", brandId: a.brand.id } } } });
    const gestao = (await loadActor(prisma, gid))!;
    const permuta = await prisma.contractTemplate.create({ data: { brandId: a.brand.id, key: "ugc", name: "UGC", releaseMinCents: null, months: 3 } });

    const mk = async (extra: Record<string, unknown> = {}) => {
      const acc = await prisma.creatorAccount.create({ data: { name: "X", email: `${randomUUID()}@x.com` } });
      return prisma.creator.create({ data: { brandId: a.brand.id, accountId: acc.id, categories: [], contractStart: ago(90), ...extra } });
    };
    const sale = async (creatorId: string, daysAgo: number, extra: Record<string, unknown> = {}) => {
      const at = ago(daysAgo);
      const order = await prisma.order.create({
        data: {
          brandId: a.brand.id, shopifyId: `gid://shopify/Order/${randomUUID()}`, name: `#${randomUUID().slice(0, 5)}`, createdAtShop: at, paidAt: at,
          financialStatus: "PAID", subtotalCents: 10_000, totalCents: 10_000, discountCodes: [a.coupon.code], shopifyUpdatedAt: at, ...extra,
        },
      });
      await prisma.orderAttribution.create({
        data: { brandId: a.brand.id, orderId: order.id, creatorId, couponId: a.coupon.id, rateBps: 1500, rule: "first_creator_code", evidenceCodes: [a.coupon.code] },
      });
    };

    const recent = await mk();
    await sale(recent.id, 70);
    await sale(recent.id, 5);
    const stale = await mk();
    await sale(stale.id, 65);
    await sale(stale.id, 3, { cancelledAt: ago(2) }); // cancelado não conta
    const never = await mk(); // contrato começou há 90 dias, nunca vendeu
    const newbie = await mk({ contractStart: ago(10) });
    await mk({ status: "INACTIVE" });
    await mk({ contractTemplateId: permuta.id });

    const rows = new Map((await listCreators(prisma, gestao, a.brand.id)).map((r) => [r.id, r.idle]));
    expect(rows.get(recent.id)).toMatchObject({ idle: false, days: 5 });
    expect(rows.get(stale.id)).toMatchObject({ idle: true, days: 65 });
    expect(rows.get(never.id)).toMatchObject({ idle: true, days: 90, lastSaleDay: null });
    expect(rows.get(newbie.id)).toMatchObject({ idle: false, days: 10 });
    expect([...rows.values()].filter((v) => v === null)).toHaveLength(2);
    expect((await creatorProfile(prisma, gestao, stale.id)).idle).toMatchObject({ idle: true, days: 65 });

    const idleInBrand = [...rows.values()].filter((v) => v?.idle).length; // inclui a creator do seedBrand
    expect((await staffHome(prisma, gestao)).creators?.idle).toBe(idleInBrand);
  });
});
