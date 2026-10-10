import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { loadActor } from "@/lib/auth/actor";
import { decideAttribution, recheckBrand } from "@/lib/commission/attribution";
import { classifyCoupon, confirmOwner, confirmRate } from "@/lib/coupons/review";
import { testClient, letters } from "./fixtures";

const prisma = testClient();
afterAll(() => prisma.$disconnect());
beforeEach(async () => {
  await prisma.job.deleteMany();
});

const u = () => letters();
const SINCE = new Date("2026-07-21T00:00:00Z");

/** Marca com duas creators importadas (tudo a confirmar) e um cupom promocional ainda sem tipo. */
async function world() {
  const brand = await prisma.brand.create({ data: { slug: `b-${u().toLowerCase()}`, name: "Botanika" } });
  const mk = async (name: string) => {
    const account = await prisma.creatorAccount.create({ data: { name, email: `${randomUUID()}@x.com` } });
    const creator = await prisma.creator.create({ data: { brandId: brand.id, accountId: account.id, categories: [] } });
    const coupon = await prisma.coupon.create({ data: { brandId: brand.id, code: `${name.toUpperCase()}${u()}` } });
    await prisma.couponAssignment.create({ data: { brandId: brand.id, couponId: coupon.id, creatorId: creator.id, validFrom: SINCE } });
    const policy = await prisma.commissionPolicy.create({ data: { brandId: brand.id, creatorId: creator.id, rateBps: 1500, validFrom: SINCE } });
    return { creator, coupon, policy };
  };
  const ana = await mk("ANA");
  const bia = await mk("BIA");
  const promo = await prisma.coupon.create({ data: { brandId: brand.id, code: `PROMO${u()}` } });
  const id = randomUUID();
  await prisma.user.create({ data: { id, email: `${id}@x.com`, name: "Ana G", roleGrants: { create: { role: "GESTAO", brandId: brand.id } } } });
  return { brand, ana, bia, promo, gestao: (await loadActor(prisma, id))! };
}

async function order(brandId: string, codes: string[], paidAt: Date | null = new Date("2026-09-10T12:00:00Z")) {
  return prisma.order.create({
    data: {
      brandId,
      shopifyId: `gid://shopify/Order/${randomUUID()}`,
      name: "#1",
      createdAtShop: new Date("2026-09-10T11:59:00Z"),
      paidAt,
      financialStatus: paidAt ? "PAID" : "PENDING",
      subtotalCents: 10_000,
      totalCents: 11_000,
      discountCodes: codes,
      shopifyUpdatedAt: new Date("2026-09-10T12:00:00Z"),
    },
  });
}

describe("atribuição no banco", () => {
  it("tudo a confirmar: fica pendente sem gravar; confirmar destrava e congela a taxa", async () => {
    const w = await world();
    const o = await order(w.brand.id, [w.promo.code, w.ana.coupon.code]);
    expect(await decideAttribution(prisma, o.id)).toMatchObject({ status: "pending", reason: "unclassified", code: w.promo.code });

    await classifyCoupon(prisma, w.gestao, w.promo.id, "PROMO");
    expect(await decideAttribution(prisma, o.id)).toMatchObject({ status: "pending", reason: "unclassified", code: w.ana.coupon.code });

    await classifyCoupon(prisma, w.gestao, w.ana.coupon.id, "CREATOR");
    expect(await decideAttribution(prisma, o.id)).toMatchObject({ status: "pending", reason: "owner_unconfirmed" });

    await confirmOwner(prisma, w.gestao, { couponId: w.ana.coupon.id, creatorId: w.ana.creator.id });
    // Dona confirmada, taxa ainda a confirmar: atribui, mas sem taxa.
    expect(await decideAttribution(prisma, o.id)).toEqual({ status: "attributed", creatorId: w.ana.creator.id, rateBps: null });

    await confirmRate(prisma, w.gestao, { policyId: w.ana.policy.id, rateBps: 1500 });
    expect(await decideAttribution(prisma, o.id)).toEqual({ status: "rate_frozen", rateBps: 1500 });
    expect(await decideAttribution(prisma, o.id)).toEqual({ status: "unchanged" });

    const a = await prisma.orderAttribution.findUniqueOrThrow({ where: { orderId: o.id } });
    expect(a).toMatchObject({ creatorId: w.ana.creator.id, couponId: w.ana.coupon.id, rateBps: 1500, rule: "first_creator_code_v1", evidenceCodes: [w.promo.code, w.ana.coupon.code] });
    // Cada confirmação pediu reavaliação da marca.
    expect(await prisma.job.count({ where: { brandId: w.brand.id, type: "attribution.recheck" } })).toBeGreaterThanOrEqual(1);
  });

  it("decidida uma vez: trocar a dona depois não move o pedido", async () => {
    const w = await world();
    await classifyCoupon(prisma, w.gestao, w.ana.coupon.id, "CREATOR");
    await confirmOwner(prisma, w.gestao, { couponId: w.ana.coupon.id, creatorId: w.ana.creator.id });
    const o = await order(w.brand.id, [w.ana.coupon.code]);
    await decideAttribution(prisma, o.id);
    // Dona muda no banco (ex.: correção futura): a atribuição gravada não muda.
    await prisma.couponAssignment.updateMany({ where: { couponId: w.ana.coupon.id }, data: { creatorId: w.bia.creator.id } });
    expect(await decideAttribution(prisma, o.id)).toMatchObject({ status: "unchanged" });
    expect((await prisma.orderAttribution.findUniqueOrThrow({ where: { orderId: o.id } })).creatorId).toBe(w.ana.creator.id);
  });

  it("U5: aviso de primeira venda só para venda recente e só uma vez", async () => {
    const w = await world();
    await classifyCoupon(prisma, w.gestao, w.ana.coupon.id, "CREATOR");
    await confirmOwner(prisma, w.gestao, { couponId: w.ana.coupon.id, creatorId: w.ana.creator.id });
    const firstSale = () => prisma.notification.count({ where: { creatorId: w.ana.creator.id, kind: "FIRST_SALE" } });
    // Venda antiga (carga histórica): não avisa.
    await decideAttribution(prisma, (await order(w.brand.id, [w.ana.coupon.code], new Date(Date.now() - 30 * 86_400_000))).id);
    expect(await firstSale()).toBe(0);
    // Outra creator, venda recente e única: avisa uma vez.
    await classifyCoupon(prisma, w.gestao, w.bia.coupon.id, "CREATOR");
    await confirmOwner(prisma, w.gestao, { couponId: w.bia.coupon.id, creatorId: w.bia.creator.id });
    await decideAttribution(prisma, (await order(w.brand.id, [w.bia.coupon.code], new Date(Date.now() - 86_400_000))).id);
    await decideAttribution(prisma, (await order(w.brand.id, [w.bia.coupon.code], new Date())).id);
    expect(await prisma.notification.findMany({ where: { creatorId: w.bia.creator.id }, select: { kind: true, href: true } })).toEqual([
      { kind: "FIRST_SALE", href: `/portal/${w.brand.slug}/vendas` },
    ]);
  });

  it("pedido não pago atribui sem taxa; a taxa congela quando ele é pago", async () => {
    const w = await world();
    await classifyCoupon(prisma, w.gestao, w.bia.coupon.id, "CREATOR");
    await confirmOwner(prisma, w.gestao, { couponId: w.bia.coupon.id, creatorId: w.bia.creator.id });
    await confirmRate(prisma, w.gestao, { policyId: w.bia.policy.id, rateBps: 1000 });
    const o = await order(w.brand.id, [w.bia.coupon.code], null);
    expect(await decideAttribution(prisma, o.id)).toMatchObject({ status: "attributed", rateBps: null });
    await prisma.order.update({ where: { id: o.id }, data: { paidAt: new Date("2026-09-11T10:00:00Z"), financialStatus: "PAID" } });
    expect(await decideAttribution(prisma, o.id)).toEqual({ status: "rate_frozen", rateBps: 1000 });
  });

  it("pago antes da taxa vigente começar: fica sem taxa (nunca usa a atual por omissão)", async () => {
    const w = await world();
    await classifyCoupon(prisma, w.gestao, w.ana.coupon.id, "CREATOR");
    await confirmOwner(prisma, w.gestao, { couponId: w.ana.coupon.id, creatorId: w.ana.creator.id });
    await confirmRate(prisma, w.gestao, { policyId: w.ana.policy.id, rateBps: 1500 });
    const o = await order(w.brand.id, [w.ana.coupon.code], new Date("2026-06-01T12:00:00Z"));
    await prisma.order.update({ where: { id: o.id }, data: { createdAtShop: new Date("2026-07-25T00:00:00Z") } });
    expect(await decideAttribution(prisma, o.id)).toMatchObject({ status: "attributed", rateBps: null });
  });

  it("reavaliação da marca resolve os pendentes de uma vez", async () => {
    const w = await world();
    const o1 = await order(w.brand.id, [w.ana.coupon.code]);
    const o2 = await order(w.brand.id, [w.bia.coupon.code]);
    await order(w.brand.id, []);
    expect(await recheckBrand(prisma, w.brand.id)).toEqual({ checked: 2, attributed: 0, frozen: 0, pending: 2 });
    for (const c of [w.ana, w.bia]) {
      await classifyCoupon(prisma, w.gestao, c.coupon.id, "CREATOR");
      await confirmOwner(prisma, w.gestao, { couponId: c.coupon.id, creatorId: c.creator.id });
      await confirmRate(prisma, w.gestao, { policyId: c.policy.id, rateBps: 1500 });
    }
    expect(await recheckBrand(prisma, w.brand.id)).toEqual({ checked: 2, attributed: 2, frozen: 0, pending: 0 });
    expect(await prisma.orderAttribution.count({ where: { orderId: { in: [o1.id, o2.id] }, rateBps: 1500 } })).toBe(2);
    expect(await recheckBrand(prisma, w.brand.id)).toEqual({ checked: 0, attributed: 0, frozen: 0, pending: 0 });
  });

  it("marca nova nasce com 7 dias de retenção (D-HOLD)", async () => {
    const b = await prisma.brand.create({ data: { slug: `h-${u().toLowerCase()}`, name: "X" } });
    expect(b.commissionHoldDays).toBe(7);
  });
});
