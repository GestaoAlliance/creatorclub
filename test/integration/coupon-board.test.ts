import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { loadActor } from "@/lib/auth/actor";
import { classifyManyPromo, couponBoard, confirmOwnerAndRate } from "@/lib/coupons/board";
import { seedBrand, testClient, letters } from "./fixtures";

const prisma = testClient();
afterAll(() => prisma.$disconnect());

async function gestao(brandId: string) {
  const id = randomUUID();
  await prisma.user.create({ data: { id, email: `${id}@x.com`, name: "Ana", roleGrants: { create: { role: "GESTAO", brandId } } } });
  return (await loadActor(prisma, id))!;
}

let n = 0;
async function order(brandId: string, code: string, at: string, cents: number, extra: object = {}) {
  n++;
  return prisma.order.create({
    data: { brandId, shopifyId: `gid://shopify/Order/cb-${randomUUID()}`, name: `#cb${n}`, createdAtShop: new Date(at), paidAt: new Date(at), financialStatus: "PAID", subtotalCents: cents, totalCents: cents, discountCodes: [code], shopifyUpdatedAt: new Date(at), ...extra },
  });
}

describe("tela Cupons (D-COUPONBOARD, banco real)", () => {
  it("contexto, comissão parada, sugestão de dona, parados e creators sem cupom", async () => {
    const { brand, creator, account, coupon } = await seedBrand(prisma); // cupom CREATOR sem dona confirmada, 1 pedido em 01/09
    const now = new Date("2026-11-12T15:00:00Z");
    const solta = await prisma.coupon.create({ data: { brandId: brand.id, code: `${account.name.split(" ")[1]!.toUpperCase()}${letters().slice(0, 2)}` } });
    await prisma.creatorAccount.update({ where: { id: account.id }, data: { instagram: `@${solta.code.toLowerCase()}` } });
    await order(brand.id, solta.code, "2026-11-01T15:00:00Z", 10_000);
    await order(brand.id, solta.code, "2026-11-05T15:00:00Z", 30_000);
    await order(brand.id, solta.code, "2026-11-06T15:00:00Z", 50_000, { cancelledAt: new Date("2026-11-07T00:00:00Z") }); // cancelado: conta o uso, não a venda
    await order(brand.id, solta.code, "2026-11-06T16:00:00Z", 70_000, { test: true }); // teste: ignorado
    const ana = await gestao(brand.id);

    const b = await couponBoard(prisma, ana, brand.id, now);
    const row = b.rows.find((r) => r.id === solta.id)!;
    expect(row).toMatchObject({ kind: null, orders: 3, salesCents: 40_000, sales30Cents: 40_000, firstUse: "2026-11-01", lastUse: "2026-11-06", pending: true, suggestion: { creatorId: creator.id } });
    expect(row.waitingCommissionCents).toBe(Math.round((40_000 * brand.defaultCommissionBps) / 10_000));
    // O cupom do seed é CREATOR sem dona: usado só em 01/09 → pendente e parado.
    expect(b.rows.find((r) => r.id === coupon.id)).toMatchObject({ kind: "CREATOR", pending: true, idle: true, orders: 1 });
    expect(b.withoutCoupon.map((c) => c.id)).toContain(creator.id);
  });

  it("dona + comissão num passo (classifica como CREATOR); vários sem tipo viram PROMO, os já classificados ficam", async () => {
    const { brand, creator } = await seedBrand(prisma);
    const ana = await gestao(brand.id);
    const nova = await prisma.coupon.create({ data: { brandId: brand.id, code: `NV${letters()}` } });
    await prisma.commissionPolicy.create({ data: { brandId: brand.id, creatorId: creator.id, rateBps: 1500, validFrom: new Date("2026-08-01T03:00:00Z") } });
    const r = await confirmOwnerAndRate(prisma, ana, { couponId: nova.id, creatorId: creator.id, since: new Date("2026-08-01T03:00:00Z"), rateBps: 1200 });
    expect(r).toEqual({ rate: true });
    expect(await prisma.coupon.findUniqueOrThrow({ where: { id: nova.id } })).toMatchObject({ kind: "CREATOR" });
    expect(await prisma.commissionPolicy.findFirstOrThrow({ where: { creatorId: creator.id, validTo: null } })).toMatchObject({ rateBps: 1200, confirmedById: ana.userId });
    const b = await couponBoard(prisma, ana, brand.id);
    expect(b.rows.find((x) => x.id === nova.id)).toMatchObject({ pending: false, owner: { confirmed: true }, rate: { confirmed: true } });
    expect(b.withoutCoupon.map((c) => c.id)).not.toContain(creator.id);

    const p1 = await prisma.coupon.create({ data: { brandId: brand.id, code: `PA${letters()}` } });
    const p2 = await prisma.coupon.create({ data: { brandId: brand.id, code: `PB${letters()}` } });
    expect(await classifyManyPromo(prisma, ana, [p1.id, p2.id, nova.id, p1.id])).toBe(2);
    expect((await prisma.coupon.findMany({ where: { id: { in: [p1.id, p2.id, nova.id] } }, orderBy: { code: "asc" } })).map((c) => c.kind).sort()).toEqual(["CREATOR", "PROMO", "PROMO"]);
    expect(await prisma.auditLog.count({ where: { actorId: ana.userId, action: "coupon.classify" } })).toBe(3);
    await expect(classifyManyPromo(prisma, ana, [])).rejects.toThrow(/Marque/);
  });
});
