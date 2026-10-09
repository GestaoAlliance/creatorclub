import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { loadActor } from "@/lib/auth/actor";
import { classifyCoupon, confirmOwner, confirmRate, couponReview } from "@/lib/coupons/review";
import { seedBrand, testClient } from "./fixtures";

const prisma = testClient();
afterAll(() => prisma.$disconnect());

async function userWith(role: "GESTAO" | "PAGAMENTO" | "SUPER_ADMIN", brandId: string | null) {
  const id = randomUUID();
  await prisma.user.create({ data: { id, email: `${id}@x.com`, name: role, roleGrants: { create: { role, brandId } } } });
  return (await loadActor(prisma, id))!;
}

/** Marca com uma creator importada: cupom sem tipo, dona e taxa a confirmar. */
async function imported() {
  const { brand, creator, account } = await seedBrand(prisma);
  const coupon = await prisma.coupon.create({ data: { brandId: brand.id, code: `IMP${randomUUID().slice(0, 4).replace(/\d/g, "X").toUpperCase()}` } });
  const since = new Date("2026-07-21T00:45:04Z");
  const assignment = await prisma.couponAssignment.create({ data: { brandId: brand.id, couponId: coupon.id, creatorId: creator.id, validFrom: since } });
  const policy = await prisma.commissionPolicy.create({ data: { brandId: brand.id, creatorId: creator.id, rateBps: 1500, validFrom: since } });
  return { brand, creator, account, coupon, assignment, policy };
}

describe("conferência da Ana (banco real)", () => {
  it("Gestão classifica, confirma dona e taxa (corrigindo o valor); tudo auditado; progresso conta a creator", async () => {
    const { brand, creator, coupon, policy } = await imported();
    const ana = await userWith("GESTAO", brand.id);

    let review = await couponReview(prisma, ana, brand.id);
    expect(review.progress).toEqual({ activeCreators: 1, confirmed: 0 });
    expect(review.rows.find((r) => r.id === coupon.id)).toMatchObject({ kind: null, owner: { confirmed: false }, rate: { rateBps: 1500, confirmed: false } });

    await expect(confirmOwner(prisma, ana, { couponId: coupon.id, creatorId: creator.id })).rejects.toThrow(/Classifique/);
    await classifyCoupon(prisma, ana, coupon.id, "CREATOR");
    await confirmOwner(prisma, ana, { couponId: coupon.id, creatorId: creator.id });
    await confirmRate(prisma, ana, { policyId: policy.id, rateBps: 1250 });

    review = await couponReview(prisma, ana, brand.id);
    expect(review.progress).toEqual({ activeCreators: 1, confirmed: 1 });
    expect(review.rows.find((r) => r.id === coupon.id)).toMatchObject({ kind: "CREATOR", owner: { confirmed: true }, rate: { rateBps: 1250, confirmed: true } });
    const actions = (await prisma.auditLog.findMany({ where: { actorId: ana.userId }, orderBy: { createdAt: "asc" } })).map((a) => a.action);
    expect(actions).toEqual(["coupon.classify", "coupon.owner.confirm", "commission.confirm"]);

    // Já confirmado não se confirma de novo por aqui.
    await expect(confirmRate(prisma, ana, { policyId: policy.id, rateBps: 1500 })).rejects.toThrow(/já foi confirmada/);
    await expect(confirmOwner(prisma, ana, { couponId: coupon.id, creatorId: creator.id })).rejects.toThrow(/já foi confirmada/);
  });

  it("dona importada errada é trocada antes de confirmar; cupom sem dona exige a data", async () => {
    const { brand, coupon, assignment } = await imported();
    const outraConta = await prisma.creatorAccount.create({ data: { name: "Outra", email: `${randomUUID()}@x.com` } });
    const outra = await prisma.creator.create({ data: { brandId: brand.id, accountId: outraConta.id, categories: [] } });
    const ana = await userWith("GESTAO", brand.id);
    await classifyCoupon(prisma, ana, coupon.id, "CREATOR");
    await confirmOwner(prisma, ana, { couponId: coupon.id, creatorId: outra.id });
    expect(await prisma.couponAssignment.findUniqueOrThrow({ where: { id: assignment.id } })).toMatchObject({ creatorId: outra.id, confirmedById: ana.userId });

    const novo = await prisma.coupon.create({ data: { brandId: brand.id, code: `NV${randomUUID().slice(0, 4).replace(/\d/g, "X").toUpperCase()}` } });
    await classifyCoupon(prisma, ana, novo.id, "CREATOR");
    await expect(confirmOwner(prisma, ana, { couponId: novo.id, creatorId: outra.id })).rejects.toThrow(/desde quando/);
    await confirmOwner(prisma, ana, { couponId: novo.id, creatorId: outra.id, since: new Date("2026-08-01T03:00:00Z") });
    expect(await prisma.couponAssignment.count({ where: { couponId: novo.id, confirmedAt: { not: null } } })).toBe(1);
  });

  it("PROMO: dona do app antigo fica ignorada; cupom que já levou pedido não muda de tipo", async () => {
    const { brand, coupon } = await imported();
    const admin = await userWith("SUPER_ADMIN", null);
    await classifyCoupon(prisma, admin, coupon.id, "PROMO");
    const row = (await couponReview(prisma, admin, brand.id)).rows.find((r) => r.id === coupon.id);
    expect(row).toMatchObject({ kind: "PROMO", owner: { confirmed: false } });

    const seeded = await seedBrand(prisma); // cupom CREATOR já classificado, com pedido
    await prisma.orderAttribution.create({
      data: { brandId: seeded.brand.id, orderId: seeded.order.id, creatorId: seeded.creator.id, couponId: seeded.coupon.id, rule: "first_creator_code_v1", evidenceCodes: [seeded.coupon.code] },
    });
    await expect(classifyCoupon(prisma, admin, seeded.coupon.id, "PROMO")).rejects.toThrow(/mudaria o passado/);
  });

  it("quem não edita creators da marca não vê nem mexe", async () => {
    const { brand, coupon, policy } = await imported();
    const pagamento = await userWith("PAGAMENTO", brand.id);
    const outraMarca = await userWith("GESTAO", (await seedBrand(prisma)).brand.id);
    await expect(couponReview(prisma, pagamento, brand.id)).rejects.toThrow(/Sem permissão/);
    await expect(classifyCoupon(prisma, outraMarca, coupon.id, "PROMO")).rejects.toThrow(/Sem permissão/);
    await expect(confirmRate(prisma, null, { policyId: policy.id, rateBps: 1500 })).rejects.toThrow(/Sem permissão/);
  });
});
