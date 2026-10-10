import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { loadActor } from "@/lib/auth/actor";
import { correctRateSinceStart } from "@/lib/commission/rate-fix";
import { postCommission } from "@/lib/commission/ledger";
import { seedBrand, testClient } from "./fixtures";

const prisma = testClient();
afterAll(() => prisma.$disconnect());

async function userWith(role: "SUPER_ADMIN" | "GESTAO", brandId: string | null) {
  const id = randomUUID();
  await prisma.user.create({ data: { id, email: `${id}@x.com`, name: role, roleGrants: { create: { role, brandId } } } });
  return (await loadActor(prisma, id))!;
}

/** Creator com taxa provisória de 15% e um pedido de R$ 200 já lançado (R$ 30). */
async function seeded() {
  const a = await seedBrand(prisma);
  await prisma.commissionPolicy.create({
    data: { brandId: a.brand.id, creatorId: a.creator.id, rateBps: 1500, validFrom: new Date("2026-01-01T00:00:00Z"), confirmedAt: new Date(), confirmedById: "provisorio" },
  });
  await prisma.orderAttribution.create({
    data: { brandId: a.brand.id, orderId: a.order.id, creatorId: a.creator.id, couponId: a.coupon.id, rateBps: 1500, rule: "first_creator_code", evidenceCodes: [a.coupon.code] },
  });
  await postCommission(prisma, a.order.id);
  return a;
}

const sum = async (creatorId: string) => (await prisma.ledgerEntry.aggregate({ where: { creatorId }, _sum: { amountCents: true } }))._sum.amountCents;

describe("correção de taxa desde o início (D-RATEFIX, banco real)", () => {
  it("muda a taxa e o pedido, lança a diferença como estorno e reprocessar não duplica", async () => {
    const a = await seeded();
    expect(await sum(a.creator.id)).toBe(3_000);
    const sa = await userWith("SUPER_ADMIN", null);
    expect(await correctRateSinceStart(prisma, sa, a.creator.id, 1000)).toEqual({ orders: 1, deltaCents: -1_000 });
    expect(await sum(a.creator.id)).toBe(2_000);
    expect(await prisma.orderAttribution.findUniqueOrThrow({ where: { orderId: a.order.id } })).toMatchObject({ rateBps: 1000 });
    expect(await prisma.commissionPolicy.findFirstOrThrow({ where: { creatorId: a.creator.id } })).toMatchObject({ rateBps: 1000, confirmedById: sa.userId });
    const fix = await prisma.ledgerEntry.findFirstOrThrow({ where: { creatorId: a.creator.id, type: "REVERSAL" } });
    expect(fix.note).toMatch(/Correção da taxa para 10%/);
    // O worker reprocessa o mesmo pedido: nada novo.
    expect((await postCommission(prisma, a.order.id)).status).toBe("nothing");
    expect(await sum(a.creator.id)).toBe(2_000);
    expect(await prisma.auditLog.count({ where: { action: "commission.correct", brandId: a.brand.id } })).toBe(1);
    await expect(correctRateSinceStart(prisma, sa, a.creator.id, 1000)).rejects.toThrow(/já é essa/);
  });

  it("só super admin, só com saque travado, só com uma taxa no histórico", async () => {
    const a = await seeded();
    await expect(correctRateSinceStart(prisma, await userWith("GESTAO", a.brand.id), a.creator.id, 1000)).rejects.toThrow(/super admin/);
    const sa = await userWith("SUPER_ADMIN", null);
    await expect(correctRateSinceStart(prisma, sa, a.creator.id, 10_001)).rejects.toThrow(/inválida/);
    await prisma.creator.update({ where: { id: a.creator.id }, data: { withdrawalsUnlockedAt: new Date(), withdrawalsUnlockedById: "pagamento" } });
    await expect(correctRateSinceStart(prisma, sa, a.creator.id, 1000)).rejects.toThrow(/ajuste/);

    const b = await seeded();
    await prisma.commissionPolicy.updateMany({ where: { creatorId: b.creator.id }, data: { validTo: new Date("2026-10-01T00:00:00Z") } });
    await prisma.commissionPolicy.create({ data: { brandId: b.brand.id, creatorId: b.creator.id, rateBps: 1200, validFrom: new Date("2026-10-01T00:00:00Z") } });
    await expect(correctRateSinceStart(prisma, sa, b.creator.id, 1000)).rejects.toThrow(/mais de uma taxa/);
    expect(await sum(b.creator.id)).toBe(3_000);
  });
});
