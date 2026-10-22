import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { listSales, salesForCsv } from "@/lib/sales/list";
import { commissionEntry, seedBrand, testClient } from "./fixtures";

const prisma = testClient();
afterAll(() => prisma.$disconnect());

describe("vendas da equipe (M0.1, banco real)", () => {
  it("lista todas as vendas da marca com situação, creator ou motivo, comissão e filtros", async () => {
    const { brand, creator, coupon, order, account } = await seedBrand(prisma);
    const other = await seedBrand(prisma); // outra marca: nunca aparece
    await prisma.orderAttribution.create({ data: { brandId: brand.id, orderId: order.id, creatorId: creator.id, couponId: coupon.id, rateBps: 1500, rule: "first", evidenceCodes: [coupon.code] } });
    await prisma.ledgerEntry.create({ data: commissionEntry({ brandId: brand.id, creatorId: creator.id, orderId: order.id }) });
    await prisma.coupon.create({ data: { brandId: brand.id, code: "BLACKFRIDAY", kind: "PROMO", classifiedAt: new Date(), classifiedById: "seed" } });
    const mk = (name: string, extra: object) =>
      prisma.order.create({
        data: { brandId: brand.id, shopifyId: `gid://shopify/Order/${randomUUID()}`, name, createdAtShop: new Date("2026-10-10T15:00:00Z"), financialStatus: "PENDING", subtotalCents: 5_000, totalCents: 6_000, discountCodes: [], shopifyUpdatedAt: new Date(), ...extra },
      });
    await mk("#P1", { discountCodes: ["blackfriday"], financialStatus: "PAID", paidAt: new Date("2026-10-10T15:00:00Z") });
    await mk("#P2", {});
    await mk("#P3", { cancelledAt: new Date(), financialStatus: "PAID" });
    await mk("#P4", { test: true });

    const all = await listSales(prisma, brand.id, {});
    expect(all.total).toBe(5);
    expect(all.counts).toEqual({ PAID: 2, PENDING: 1, REFUNDED: 0, CANCELLED: 1, TEST: 1 });
    expect(all.rows.at(-1)!.name).toBe(order.name); // mais novas primeiro
    const own = all.rows.find((r) => r.name === order.name)!;
    expect(own).toMatchObject({ status: "PAID", creatorId: creator.id, creatorName: account.name, commissionCents: 3000, reason: `cupom de creator ${coupon.code}` });
    expect(all.rows.find((r) => r.name === "#P1")).toMatchObject({ creatorId: null, codes: ["BLACKFRIDAY"], reason: expect.stringMatching(/PROMO/), commissionCents: null });
    expect(all.rows.find((r) => r.name === "#P2")!.reason).toBe("sem cupom");

    // Filtros: situação, com/sem creator, busca por creator, cupom e pedido, período.
    expect((await listSales(prisma, brand.id, { status: "PENDING" })).rows.map((r) => r.name)).toEqual(["#P2"]);
    expect((await listSales(prisma, brand.id, { owner: "creator" })).total).toBe(1);
    expect((await listSales(prisma, brand.id, { owner: "none" })).total).toBe(4);
    expect((await listSales(prisma, brand.id, { q: account.name.slice(0, 10) })).total).toBe(1);
    expect((await listSales(prisma, brand.id, { q: "blackfriday" })).total).toBe(1);
    expect((await listSales(prisma, brand.id, { q: "#P3" })).total).toBe(1);
    expect((await listSales(prisma, brand.id, { from: "2026-10-01", to: "2026-10-31" })).total).toBe(4);
    expect((await listSales(prisma, brand.id, { to: "2026-09-30" })).rows.map((r) => r.name)).toEqual([order.name]);
    // Outra marca não vaza.
    expect((await listSales(prisma, other.brand.id, {})).total).toBe(1);

    const csv = await salesForCsv(prisma, brand.id, { status: "PAID" });
    expect(csv.map((r) => r.order).sort()).toEqual(["#P1", order.name].sort());
    expect(csv.find((r) => r.order === order.name)).toMatchObject({ creator: account.name, commissionCents: 3000, subtotalCents: 20_000 });
  });
});
