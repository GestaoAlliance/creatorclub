import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { loadActor } from "@/lib/auth/actor";
import { listCreators } from "@/lib/creators/profile";
import { seedBrand, testClient } from "./fixtures";

const prisma = testClient();
afterAll(() => prisma.$disconnect());

describe("último pedido e pendências na lista Creators (D-LASTORDER, D-CREATORPENDING, banco real)", () => {
  it("último pedido elegível com o cupom dela, no período em que era dela, mesmo com a dona a confirmar", async () => {
    const a = await seedBrand(prisma);
    const gid = randomUUID();
    await prisma.user.create({ data: { id: gid, email: `${gid}@x.com`, name: "G", roleGrants: { create: { role: "GESTAO", brandId: a.brand.id } } } });
    const gestao = (await loadActor(prisma, gid))!;
    // O cupom foi de outra creator até 01/09; desde então é da creator do seedBrand (dona e taxa ainda a confirmar).
    const otherAcc = await prisma.creatorAccount.create({ data: { name: "Outra", email: `${randomUUID()}@x.com` } });
    const other = await prisma.creator.create({ data: { brandId: a.brand.id, accountId: otherAcc.id, categories: [], reviewedAt: new Date(), reviewedById: gid } });
    const cut = new Date("2026-09-01T00:00:00Z");
    await prisma.couponAssignment.create({ data: { brandId: a.brand.id, couponId: a.coupon.id, creatorId: other.id, validFrom: new Date("2026-08-01T00:00:00Z"), validTo: cut, confirmedAt: new Date(), confirmedById: gid } });
    await prisma.couponAssignment.create({ data: { brandId: a.brand.id, couponId: a.coupon.id, creatorId: a.creator.id, validFrom: cut } });
    await prisma.commissionPolicy.create({ data: { brandId: a.brand.id, creatorId: a.creator.id, rateBps: 1500, validFrom: cut } });
    const order = (name: string, at: string, extra: Record<string, unknown> = {}) =>
      prisma.order.create({
        data: {
          brandId: a.brand.id, shopifyId: `gid://shopify/Order/${randomUUID()}`, name, createdAtShop: new Date(at), paidAt: new Date(at),
          financialStatus: "PAID", subtotalCents: 10_000, totalCents: 10_000, discountCodes: [a.coupon.code.toLowerCase()], shopifyUpdatedAt: new Date(at), ...extra,
        },
      });
    await order("#ANTES", "2026-08-20T12:00:00Z"); // ainda era da outra
    await order("#BOM", "2026-10-05T15:00:00Z");
    await order("#CANCELADO", "2026-10-08T12:00:00Z", { cancelledAt: new Date("2026-10-08T13:00:00Z") });
    await order("#TESTE", "2026-10-09T12:00:00Z", { test: true });

    const rows = new Map((await listCreators(prisma, gestao, a.brand.id)).map((r) => [r.id, r]));
    expect(rows.get(a.creator.id)).toMatchObject({
      lastOrder: { name: "#BOM", day: "2026-10-05" },
      pendings: ["dona do cupom a confirmar", "taxa a confirmar", "números a conferir"],
    });
    expect(rows.get(other.id)).toMatchObject({ lastOrder: { name: "#ANTES", day: "2026-08-20" }, pendings: [] });
  });
});
