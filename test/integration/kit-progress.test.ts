import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import type { PortalContext } from "@/lib/portal/context";
import { kitProgress } from "@/lib/shipments/kits";
import { seedBrand, testClient } from "./fixtures";

const prisma = testClient();
afterAll(() => prisma.$disconnect());

const ctxOf = (s: Awaited<ReturnType<typeof seedBrand>>) => ({ creatorId: s.creator.id, brand: { id: s.brand.id, slug: s.brand.slug } }) as unknown as PortalContext;

async function sale(s: Awaited<ReturnType<typeof seedBrand>>, paidAt: string, cents: number) {
  const order = await prisma.order.create({
    data: { brandId: s.brand.id, shopifyId: `gid://shopify/Order/${randomUUID()}`, name: `#${randomUUID().slice(0, 6)}`, createdAtShop: new Date(paidAt), paidAt: new Date(paidAt), financialStatus: "PAID", subtotalCents: cents, totalCents: cents, discountCodes: [s.coupon.code], shopifyUpdatedAt: new Date(paidAt) },
  });
  await prisma.orderAttribution.create({ data: { brandId: s.brand.id, orderId: order.id, creatorId: s.creator.id, couponId: s.coupon.id, rateBps: 1500, rule: "FIRST_CREATOR_CODE", evidenceCodes: [s.coupon.code] } });
}

describe("próximo produto na aba Pedidos (D-KITPROGRESS, banco real)", () => {
  it("meta de R$ 1.000: janela atual, vendido e quanto falta; já liberado na janela", async () => {
    const s = await seedBrand(prisma);
    await prisma.creator.update({ where: { id: s.creator.id }, data: { status: "ACTIVE", goalStartAt: new Date("2026-11-01T00:00:00Z") } });
    await sale(s, "2026-11-10T15:00:00Z", 30_000);
    const p = await kitProgress(prisma, ctxOf(s), new Date("2026-11-20T15:00:00Z"));
    expect(p).toEqual({ kind: "GOAL", from: "2026-11-01", to: "2026-12-15", salesCents: 30_000, goalCents: 100_000, granted: false });
    await prisma.kitGrant.create({ data: { brandId: s.brand.id, creatorId: s.creator.id, kind: "GOAL", month: "2026-11", window: 0, salesCents: 100_000, products: 1 } });
    expect(await kitProgress(prisma, ctxOf(s), new Date("2026-11-20T15:00:00Z"))).toMatchObject({ granted: true });
    // Sem início da meta: nada a mostrar.
    await prisma.creator.update({ where: { id: s.creator.id }, data: { goalStartAt: null } });
    expect(await kitProgress(prisma, ctxOf(s), new Date("2026-11-20T15:00:00Z"))).toBeNull();
  });

  it("tabela mensal (Botanika): vendas do mês e a próxima faixa; nos 3 primeiros meses vale R$ 500", async () => {
    const s = await seedBrand(prisma);
    await prisma.brand.update({ where: { id: s.brand.id }, data: { monthlyKitFrom: "2026-11" } });
    await prisma.creator.update({ where: { id: s.creator.id }, data: { status: "ACTIVE", contractStart: new Date("2026-01-10T00:00:00Z") } });
    await sale(s, "2026-11-05T15:00:00Z", 120_000);
    expect(await kitProgress(prisma, ctxOf(s), new Date("2026-11-20T15:00:00Z"))).toEqual({ kind: "TIER", month: "2026-11", salesCents: 120_000, total: 1, next: { fromCents: 400_000, total: 2 }, trial: false });
    // Nova (3 primeiros meses): R$ 300 vendidos, faltam R$ 200 para o primeiro produto (faixa de R$ 500).
    const n = await seedBrand(prisma);
    await prisma.brand.update({ where: { id: n.brand.id }, data: { monthlyKitFrom: "2026-11" } });
    await prisma.creator.update({ where: { id: n.creator.id }, data: { status: "ACTIVE", contractStart: new Date("2026-11-01T00:00:00Z") } });
    await sale(n, "2026-11-05T15:00:00Z", 30_000);
    expect(await kitProgress(prisma, ctxOf(n), new Date("2026-11-20T15:00:00Z"))).toEqual({ kind: "TIER", month: "2026-11", salesCents: 30_000, total: 0, next: { fromCents: 50_000, total: 1 }, trial: true });
  });
});
