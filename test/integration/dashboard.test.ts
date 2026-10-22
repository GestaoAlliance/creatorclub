import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { change, dashPeriod, previousPeriod, staffDashboard } from "@/lib/staff/dashboard";
import { commissionEntry, seedBrand, testClient } from "./fixtures";

const prisma = testClient();
afterAll(() => prisma.$disconnect());

describe("dashboard do Início (M0.0.4)", () => {
  it("período, período anterior e variação", () => {
    const now = new Date("2026-10-22T15:00:00Z");
    expect(dashPeriod({}, "America/Sao_Paulo", now)).toEqual({ from: "2026-09-23", to: "2026-10-22", preset: "30" });
    expect(dashPeriod({ periodo: "mes" }, "America/Sao_Paulo", now)).toEqual({ from: "2026-10-01", to: "2026-10-22", preset: "mes" });
    expect(dashPeriod({ de: "2026-10-01", ate: "2026-10-10" }, "America/Sao_Paulo", now)).toEqual({ from: "2026-10-01", to: "2026-10-10", preset: "" });
    expect(previousPeriod({ from: "2026-10-01", to: "2026-10-10" })).toEqual({ from: "2026-09-21", to: "2026-09-30" });
    expect([change(150, 100), change(50, 100), change(0, 0), change(10, 0)]).toEqual([50, -50, 0, null]);
  });

  it("vendas de creators × loja, comissão, quem vendeu, unidades, dias, top creators e produtos (banco real)", async () => {
    const { brand, creator, coupon, order } = await seedBrand(prisma); // pedido pago em 01/09: período anterior
    await prisma.orderAttribution.create({ data: { brandId: brand.id, orderId: order.id, creatorId: creator.id, couponId: coupon.id, rateBps: 1000, rule: "first", evidenceCodes: [coupon.code] } });
    const mk = async (paidAt: string | null, subtotal: number, extra: object = {}, attributed = true) => {
      const o = await prisma.order.create({
        data: { brandId: brand.id, shopifyId: `gid://shopify/Order/${randomUUID()}`, name: `#${randomUUID().slice(0, 5)}`, createdAtShop: new Date(paidAt ?? "2026-10-05T12:00:00Z"), paidAt: paidAt ? new Date(paidAt) : null, financialStatus: paidAt ? "PAID" : "PENDING", subtotalCents: subtotal, totalCents: subtotal, discountCodes: attributed ? [coupon.code] : [], shopifyUpdatedAt: new Date(), ...extra },
      });
      if (attributed) await prisma.orderAttribution.create({ data: { brandId: brand.id, orderId: o.id, creatorId: creator.id, couponId: coupon.id, rateBps: 1000, rule: "first", evidenceCodes: [coupon.code] } });
      return o;
    };
    const a = await mk("2026-10-03T15:00:00Z", 10_000);
    await prisma.orderLine.create({ data: { brandId: brand.id, orderId: a.id, shopifyId: "l1", title: "Magnésio", quantity: 2, discountedTotalCents: 10_000 } });
    await prisma.ledgerEntry.create({ data: commissionEntry({ brandId: brand.id, creatorId: creator.id, orderId: a.id }, { amountCents: 1_000 }) });
    await mk("2026-10-05T15:00:00Z", 30_000, {}, false); // loja sem cupom
    await mk(null, 5_000); // aguardando: não conta nas vendas
    await mk("2026-10-06T15:00:00Z", 9_000, { cancelledAt: new Date() }); // cancelado: não conta

    const d = await staffDashboard(prisma, brand.id, { from: "2026-10-01", to: "2026-10-10", preset: "" }, "");
    expect(d.kpis.sales).toMatchObject({ cents: 10_000, orders: 1, storeShare: 0.25 });
    expect(d.kpis.commission).toMatchObject({ cents: 1_000, rate: 0.1 });
    expect(d.kpis.creators).toMatchObject({ sold: 1, active: 1 });
    expect(d.kpis.units).toMatchObject({ count: 2, ticketCents: 10_000 });
    expect(d.store).toMatchObject({ salesCents: 40_000, paidOrders: 2, pending: 1, cancelled: 1 });
    expect(d.days).toHaveLength(10);
    expect(d.days.find((x) => x.day === "2026-10-03")).toEqual({ day: "2026-10-03", count: 1, baseCents: 10_000, commissionCents: 1_000 });
    expect(d.topCreators).toEqual([expect.objectContaining({ id: creator.id, salesCents: 10_000, orders: 1, share: 1 })]);
    expect(d.topProducts).toEqual([{ title: "Magnésio", units: 2, salesCents: 10_000, orders: 1 }]);
    expect(d.concentration).toEqual({ top1: 1, top3: 1 });
    // Filtro de tipo: creator é INFLUENCER (seedBrand); UGC não tem vendas.
    expect((await staffDashboard(prisma, brand.id, { from: "2026-10-01", to: "2026-10-10", preset: "" }, "UGC")).kpis.sales.cents).toBe(0);
    // Período anterior (21 a 30/09) sem vendas: a variação fica "sem base".
    expect(d.kpis.sales.change).toBeNull();
  });
});
