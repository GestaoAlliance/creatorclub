import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { postCommission, settleOrder } from "@/lib/commission/ledger";
import { recheckBrand } from "@/lib/commission/attribution";
import { testClient, letters } from "./fixtures";

const prisma = testClient();
afterAll(() => prisma.$disconnect());

const u = () => letters();
const T = (iso: string) => new Date(iso);

/** Marca com uma creator de cupom e taxa (15%) confirmados. */
async function world(opts: { confirmedRate?: boolean } = {}) {
  const brand = await prisma.brand.create({ data: { slug: `l-${u().toLowerCase()}`, name: "Botanika" } });
  const account = await prisma.creatorAccount.create({ data: { name: "Ana", email: `${randomUUID()}@x.com` } });
  const creator = await prisma.creator.create({ data: { brandId: brand.id, accountId: account.id, categories: [] } });
  const coupon = await prisma.coupon.create({ data: { brandId: brand.id, code: `ANA${u()}`, kind: "CREATOR", classifiedAt: new Date(), classifiedById: "ana" } });
  await prisma.couponAssignment.create({
    data: { brandId: brand.id, couponId: coupon.id, creatorId: creator.id, validFrom: T("2026-01-01T00:00:00Z"), confirmedAt: new Date(), confirmedById: "ana" },
  });
  const confirmed = opts.confirmedRate ?? true;
  const policy = await prisma.commissionPolicy.create({
    data: {
      brandId: brand.id, creatorId: creator.id, rateBps: 1500, validFrom: T("2026-01-01T00:00:00Z"),
      ...(confirmed ? { confirmedAt: new Date(), confirmedById: "ana" } : {}),
    },
  });
  return { brand, creator, coupon, policy };
}

async function order(brandId: string, code: string, extra: Record<string, unknown> = {}) {
  return prisma.order.create({
    data: {
      brandId,
      shopifyId: `gid://shopify/Order/${randomUUID()}`,
      name: "#1",
      createdAtShop: T("2026-09-10T11:59:00Z"),
      paidAt: T("2026-09-10T12:00:00Z"),
      financialStatus: "PAID",
      subtotalCents: 20_000,
      totalCents: 22_000,
      discountCodes: [code],
      shopifyUpdatedAt: T("2026-09-10T12:00:00Z"),
      ...extra,
    },
  });
}

const entries = (orderId: string) => prisma.ledgerEntry.findMany({ where: { orderId }, orderBy: { createdAt: "asc" } });

describe("lançamentos de comissão (banco real)", () => {
  it("pago: 15% de R$ 200 com 7 dias de retenção; repetir não lança de novo", async () => {
    const w = await world();
    const o = await order(w.brand.id, w.coupon.code);
    const r = await settleOrder(prisma, o.id, T("2026-09-10T12:05:00Z"));
    expect(r.post).toMatchObject({ status: "posted", entry: { type: "COMMISSION", amountCents: 3_000, baseCents: 20_000, rateBps: 1500 } });
    expect((await entries(o.id))[0]!.availableAt.toISOString()).toBe("2026-09-17T12:00:00.000Z");
    expect((await settleOrder(prisma, o.id)).post).toEqual({ status: "nothing" });
    expect(await entries(o.id)).toHaveLength(1);
  });

  it("reembolso parcial lança a diferença negativa; cancelamento zera; nada é apagado", async () => {
    const w = await world();
    const o = await order(w.brand.id, w.coupon.code);
    await settleOrder(prisma, o.id);
    await prisma.order.update({ where: { id: o.id }, data: { financialStatus: "PARTIALLY_REFUNDED", subtotalCents: 12_000, shopifyUpdatedAt: T("2026-09-12T10:00:00Z") } });
    expect((await postCommission(prisma, o.id, T("2026-09-12T10:01:00Z"))).status).toBe("posted");
    await prisma.order.update({ where: { id: o.id }, data: { cancelledAt: T("2026-09-13T10:00:00Z"), financialStatus: "REFUNDED", shopifyUpdatedAt: T("2026-09-13T10:00:00Z") } });
    await postCommission(prisma, o.id, T("2026-09-13T10:01:00Z"));
    const e = await entries(o.id);
    expect(e.map((x) => [x.type, x.amountCents])).toEqual([["COMMISSION", 3_000], ["REVERSAL", -1_200], ["REVERSAL", -1_800]]);
    expect(e.reduce((s, x) => s + x.amountCents, 0)).toBe(0);
    // Débito vale na hora do processamento.
    expect(e[1]!.availableAt.toISOString()).toBe("2026-09-12T10:01:00.000Z");
  });

  it("dois processos ao mesmo tempo na mesma versão não lançam em dobro", async () => {
    const w = await world();
    const o = await order(w.brand.id, w.coupon.code);
    await settleOrder(prisma, o.id);
    await prisma.order.update({ where: { id: o.id }, data: { financialStatus: "PARTIALLY_REFUNDED", subtotalCents: 10_000, shopifyUpdatedAt: T("2026-09-12T10:00:00Z") } });
    const results = await Promise.all(Array.from({ length: 5 }, () => postCommission(prisma, o.id)));
    expect(results.filter((r) => r.status === "posted")).toHaveLength(1);
    expect((await entries(o.id)).reduce((s, x) => s + x.amountCents, 0)).toBe(1_500);
  });

  it("sem taxa confirmada, sem atribuição, pedido de teste ou com imposto incluso: não lança", async () => {
    const w = await world({ confirmedRate: false });
    const o = await order(w.brand.id, w.coupon.code);
    expect((await settleOrder(prisma, o.id)).post).toEqual({ status: "skipped", reason: "no_rate" });
    const semCupom = await order(w.brand.id, "OUTRO");
    expect((await postCommission(prisma, semCupom.id)).status).toBe("skipped");

    const w2 = await world();
    const teste = await order(w2.brand.id, w2.coupon.code, { test: true });
    expect((await settleOrder(prisma, teste.id)).post).toEqual({ status: "nothing" });
    const imposto = await order(w2.brand.id, w2.coupon.code, { taxesIncluded: true });
    expect((await settleOrder(prisma, imposto.id)).post).toEqual({ status: "skipped", reason: "taxes_included" });
  });

  it("pendente que vira confirmado é lançado pela reavaliação", async () => {
    const w = await world({ confirmedRate: false });
    const o = await order(w.brand.id, w.coupon.code);
    await settleOrder(prisma, o.id);
    expect(await entries(o.id)).toHaveLength(0);
    await prisma.commissionPolicy.update({ where: { id: w.policy.id }, data: { confirmedAt: new Date(), confirmedById: "ana" } });
    await recheckBrand(prisma, w.brand.id, (p, id) => postCommission(p, id));
    expect((await entries(o.id)).map((x) => x.amountCents)).toEqual([3_000]);
  });
});

describe("rede de segurança da comissão (E5.5, banco real)", () => {
  it("pedido pago com dona e taxa mas sem lançamento é lançado uma vez; pendente, cancelado e teste ficam de fora", async () => {
    const { seedBrand } = await import("./fixtures");
    const { sweepUnpostedCommissions } = await import("@/lib/commission/ledger");
    const a = await seedBrand(prisma);
    // Como em produção: atribuição gravada com a taxa congelada, mas o lançamento nunca aconteceu.
    await prisma.orderAttribution.create({
      data: { brandId: a.brand.id, orderId: a.order.id, creatorId: a.creator.id, couponId: a.coupon.id, rateBps: 1500, rule: "first_creator_code", evidenceCodes: [a.coupon.code] },
    });
    const extra = async (data: Record<string, unknown>) => {
      const o = await prisma.order.create({
        data: {
          brandId: a.brand.id, shopifyId: `gid://shopify/Order/${randomUUID()}`, name: `#${letters(5)}`, createdAtShop: new Date("2026-09-02T12:00:00Z"),
          paidAt: new Date("2026-09-02T12:00:00Z"), financialStatus: "PAID", subtotalCents: 10_000, totalCents: 11_000, discountCodes: [a.coupon.code],
          shopifyUpdatedAt: new Date("2026-09-02T12:00:00Z"), ...data,
        },
      });
      await prisma.orderAttribution.create({ data: { brandId: a.brand.id, orderId: o.id, creatorId: a.creator.id, couponId: a.coupon.id, rateBps: 1500, rule: "first_creator_code", evidenceCodes: [a.coupon.code] } });
    };
    await extra({ financialStatus: "PENDING", paidAt: null });
    await extra({ cancelledAt: new Date("2026-09-03T12:00:00Z") });
    await extra({ test: true });

    expect(await sweepUnpostedCommissions(prisma, a.brand.id)).toBe(1);
    const entries = await prisma.ledgerEntry.findMany({ where: { creatorId: a.creator.id } });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ orderId: a.order.id, type: "COMMISSION", amountCents: 3_000 });
    expect(await sweepUnpostedCommissions(prisma, a.brand.id)).toBe(0);
  });
});
