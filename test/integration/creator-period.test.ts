import { describe, expect, it } from "vitest";
import { creatorPeriodSales } from "@/lib/sales/creator-period";
import { listSales } from "@/lib/sales/list";
import { commissionEntry, seedBrand, testClient } from "./fixtures";

const prisma = testClient();

describe("vendas de uma creator no período (D-PERIODPICK, banco real)", () => {
  it("resumo pelos pagos no período e lista filtrada por ela", async () => {
    const a = await seedBrand(prisma);
    await prisma.orderAttribution.create({ data: { brandId: a.brand.id, orderId: a.order.id, creatorId: a.creator.id, couponId: a.coupon.id, rateBps: 1500, rule: "first_creator_code", evidenceCodes: [a.coupon.code] } });
    await prisma.ledgerEntry.create({ data: commissionEntry({ brandId: a.brand.id, creatorId: a.creator.id, orderId: a.order.id }) });
    // Outro pedido da marca, sem creator: não entra na lista dela.
    await prisma.order.create({ data: { brandId: a.brand.id, shopifyId: `gid://x/${a.order.id}`, name: "#outro", createdAtShop: new Date("2026-09-02T12:00:00Z"), paidAt: new Date("2026-09-02T12:00:00Z"), financialStatus: "PAID", subtotalCents: 5_000, totalCents: 5_000, discountCodes: [], shopifyUpdatedAt: new Date() } });

    const tz = "America/Sao_Paulo";
    expect(await creatorPeriodSales(prisma, a.creator.id, { from: "2026-09-01", to: "2026-09-30" }, tz)).toEqual({ salesCents: 20_000, orders: 1, ticketCents: 20_000, commissionCents: 3_000 });
    expect(await creatorPeriodSales(prisma, a.creator.id, { from: "2026-10-01", to: "2026-10-31" }, tz)).toEqual({ salesCents: 0, orders: 0, ticketCents: 0, commissionCents: 0 });

    const mine = await listSales(prisma, a.brand.id, { creatorId: a.creator.id, from: "2026-09-01", to: "2026-09-30" });
    expect(mine.rows.map((r) => r.name)).toEqual([a.order.name]);
    const all = await listSales(prisma, a.brand.id, { from: "2026-09-01", to: "2026-09-30" });
    expect(all.total).toBe(2);
  });
});
