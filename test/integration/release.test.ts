import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { closeDueMonths, creatorBalance, releaseProgress } from "@/lib/commission/release";
import { commissionEntry, expectDbError, seedBrand, testClient } from "./fixtures";

const prisma = testClient();
afterAll(() => prisma.$disconnect());

const T = (iso: string) => new Date(iso);

async function sale(a: Awaited<ReturnType<typeof seedBrand>>, paidAt: string, subtotalCents: number, extra: Record<string, unknown> = {}) {
  const order = await prisma.order.create({
    data: {
      brandId: a.brand.id, shopifyId: `gid://shopify/Order/${randomUUID()}`, name: `#${randomUUID().slice(0, 5)}`, createdAtShop: T(paidAt), paidAt: T(paidAt),
      financialStatus: "PAID", subtotalCents, totalCents: subtotalCents, discountCodes: [a.coupon.code], shopifyUpdatedAt: T(paidAt), ...extra,
    },
  });
  await prisma.orderAttribution.create({
    data: { brandId: a.brand.id, orderId: order.id, creatorId: a.creator.id, couponId: a.coupon.id, rateBps: 1500, rule: "first_creator_code", evidenceCodes: [a.coupon.code] },
  });
  if (extra.cancelledAt) return order; // cancelado: sem comissão
  await prisma.ledgerEntry.create({
    data: commissionEntry({ brandId: a.brand.id, creatorId: a.creator.id, orderId: order.id }, { amountCents: Math.round(subtotalCents * 0.15), availableAt: T(paidAt) }),
  });
  return order;
}

/** Fecha só a marca do teste (o banco de teste tem outras marcas). */
const close = (brandId: string, now: Date) => closeDueMonths(prisma, now, { brandId });

describe("fechamento mensal (D-CONTRACT, banco real)", () => {
  it("abaixo do mínimo acumula; libera no dia 1 do mês em que o acumulado chega a R$ 500; não refaz", async () => {
    const a = await seedBrand(prisma); // seedBrand já tem um pedido de setembro sem atribuição nem comissão
    await sale(a, "2026-08-10T12:00:00Z", 30_000);
    await sale(a, "2026-08-20T12:00:00Z", 10_000, { cancelledAt: T("2026-08-21T00:00:00Z") }); // cancelado não conta
    await sale(a, "2026-09-10T12:00:00Z", 15_000);
    await sale(a, "2026-10-02T12:00:00Z", 40_000);

    // 01/09 00:30 em São Paulo: ainda dentro da folga de 1 h, não fecha agosto.
    expect(await close(a.brand.id, T("2026-09-01T03:30:00Z"))).toBe(0);
    expect(await prisma.monthClosing.count({ where: { brandId: a.brand.id } })).toBe(1); // fechou julho (sem vendas)

    // 01/09 05:00: fecha agosto com R$ 300 → não libera.
    expect(await close(a.brand.id, T("2026-09-01T08:00:00Z"))).toBe(0);
    let p = await releaseProgress(prisma, a.creator.id, T("2026-09-15T12:00:00Z"));
    expect(p).toMatchObject({ releasedThrough: null, minCents: 50_000, accumulatedCents: 45_000 });

    // 01/10: agosto + setembro = R$ 450 → ainda não. 01/11: + outubro = R$ 850 → libera até outubro.
    expect(await close(a.brand.id, T("2026-10-01T08:00:00Z"))).toBe(0);
    let b = await creatorBalance(prisma, a.creator, "America/Sao_Paulo", T("2026-10-20T12:00:00Z"));
    expect(b).toMatchObject({ heldCents: 12_750, availableCents: 0 });

    expect(await close(a.brand.id, T("2026-11-01T08:00:00Z"))).toBe(1);
    expect(await close(a.brand.id, T("2026-11-01T09:00:00Z"))).toBe(0); // não refaz
    // U5: um aviso de comissão liberada, sem repetir.
    expect(await prisma.notification.findMany({ where: { creatorId: a.creator.id }, select: { kind: true, dedupeKey: true } })).toEqual([
      { kind: "COMMISSION_RELEASED", dedupeKey: "release:2026-10" },
    ]);
    const rel = await prisma.commissionRelease.findMany({ where: { creatorId: a.creator.id } });
    expect(rel).toMatchObject([{ month: "2026-10", salesCents: 85_000, minCents: 50_000 }]);
    b = await creatorBalance(prisma, a.creator, "America/Sao_Paulo", T("2026-11-02T12:00:00Z"));
    expect(b).toMatchObject({ heldCents: 0, availableCents: 12_750 });
    p = await releaseProgress(prisma, a.creator.id, T("2026-11-02T12:00:00Z"));
    expect(p).toMatchObject({ releasedThrough: "2026-10", accumulatedCents: 0, nextClosingAt: T("2026-12-01T03:00:00Z") });
    expect(await prisma.auditLog.count({ where: { brandId: a.brand.id, action: "month.close" } })).toBe(4);
  });

  it("prescritor precisa de R$ 1.000", async () => {
    const a = await seedBrand(prisma);
    await prisma.creator.update({ where: { id: a.creator.id }, data: { categories: ["PRESCRITOR"] } });
    await sale(a, "2026-09-10T12:00:00Z", 80_000);
    const now = T("2026-10-01T08:00:00Z");
    expect(await close(a.brand.id, now)).toBe(0);
    expect((await releaseProgress(prisma, a.creator.id, now)).minCents).toBe(100_000);
  });

  it("D-CONTRACTVER: o mínimo do modelo assinado vale; modelo sem comissão não libera", async () => {
    const a = await seedBrand(prisma);
    const t1000 = await prisma.contractTemplate.create({ data: { brandId: a.brand.id, key: "inf-1000", name: "Influencer R$ 1.000", releaseMinCents: 100_000, months: 6 } });
    await prisma.creator.update({ where: { id: a.creator.id }, data: { contractTemplateId: t1000.id } });
    await sale(a, "2026-09-10T12:00:00Z", 80_000);
    const now = T("2026-10-01T08:00:00Z");
    expect(await close(a.brand.id, now)).toBe(0); // marca diz R$ 500, mas o contrato dela diz R$ 1.000
    expect((await releaseProgress(prisma, a.creator.id, now)).minCents).toBe(100_000);

    const b = await seedBrand(prisma);
    const permuta = await prisma.contractTemplate.create({ data: { brandId: b.brand.id, key: "ugc", name: "UGC permuta", releaseMinCents: null, months: 3 } });
    await prisma.creator.update({ where: { id: b.creator.id }, data: { contractTemplateId: permuta.id } });
    await sale(b, "2026-09-10T12:00:00Z", 80_000);
    expect(await close(b.brand.id, now)).toBe(0);
    expect((await releaseProgress(prisma, b.creator.id, now)).minCents).toBeNull();
  });

  it("trava do modelo de contrato e modelo de outra marca", async () => {
    const a = await seedBrand(prisma);
    await expectDbError(prisma.contractTemplate.create({ data: { brandId: a.brand.id, key: "x", name: "x", releaseMinCents: 0, months: 6 } }), /ContractTemplate_values/);
    const other = await seedBrand(prisma);
    const t = await prisma.contractTemplate.create({ data: { brandId: other.brand.id, key: "y", name: "y", releaseMinCents: 100_000, months: 6 } });
    await expectDbError(prisma.creator.update({ where: { id: a.creator.id }, data: { contractTemplateId: t.id } }), /Creator_contractTemplateId_brandId_fkey/);
  });

  it("travas do banco: mês no formato, liberação só com o mínimo, somente inserção", async () => {
    const a = await seedBrand(prisma);
    const base = { brandId: a.brand.id, creatorId: a.creator.id, salesCents: 50_000, minCents: 50_000 };
    await expectDbError(prisma.commissionRelease.create({ data: { ...base, month: "2026-13" } }), /CommissionRelease_month_format/);
    await expectDbError(prisma.commissionRelease.create({ data: { ...base, month: "2026-09", salesCents: 49_999 } }), /CommissionRelease_reached_min/);
    const r = await prisma.commissionRelease.create({ data: { ...base, month: "2026-09" } });
    await expectDbError(prisma.commissionRelease.update({ where: { id: r.id }, data: { salesCents: 60_000 } }), /somente inserção/);
    await expectDbError(prisma.commissionRelease.delete({ where: { id: r.id } }), /somente inserção/);
    await expectDbError(prisma.monthClosing.create({ data: { brandId: a.brand.id, month: "26-09", releases: 0 } }), /MonthClosing_month_format/);
    await expectDbError(prisma.brand.update({ where: { id: a.brand.id }, data: { releaseMinCents: 0 } }), /Brand_releaseMin_positive/);
  });
});
