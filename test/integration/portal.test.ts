import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { loadActor } from "@/lib/auth/actor";
import { portalContext, portalHome, startViewAs } from "@/lib/portal/context";
import { expectDbError, seedBrand, testClient } from "./fixtures";

const prisma = testClient();
afterAll(() => prisma.$disconnect());

/** Liga um login à conta da creator (como o convite faz). */
async function loginFor(accountId: string) {
  const id = randomUUID();
  await prisma.user.create({ data: { id, email: `${id}@x.com`, name: "Creator" } });
  await prisma.creatorAccount.update({ where: { id: accountId }, data: { userId: id } });
  return (await loadActor(prisma, id))!;
}

describe("acesso ao portal (banco real)", () => {
  it("creator entra só nas marcas em que participa, com a cor de cada uma", async () => {
    const a = await seedBrand(prisma);
    const b = await seedBrand(prisma);
    await prisma.brand.update({ where: { id: a.brand.id }, data: { name: "AAA", primaryColor: "#323C91", secondaryColor: "#C4D78A" } });
    await prisma.brand.update({ where: { id: b.brand.id }, data: { name: "BBB" } });
    // A mesma conta participa também da marca B.
    await prisma.creator.create({ data: { brandId: b.brand.id, accountId: a.account.id, categories: [], status: "DEACTIVATED" } });
    const actor = await loginFor(a.account.id);

    expect(await portalHome(prisma, actor)).toBe(a.brand.slug);
    const ctx = await portalContext(prisma, actor, a.brand.slug);
    expect(ctx).toMatchObject({ creatorId: a.creator.id, brand: { slug: a.brand.slug, primaryColor: "#323C91", secondaryColor: "#C4D78A" } });
    expect(ctx.brands.map((x) => x.slug)).toEqual([a.brand.slug, b.brand.slug]);
    // Desligada também entra (D-PORTALACCESS).
    expect((await portalContext(prisma, actor, b.brand.slug)).status).toBe("DEACTIVATED");

    const stranger = await seedBrand(prisma);
    await expect(portalContext(prisma, actor, stranger.brand.slug)).rejects.toThrow(/Sem acesso/);
    await expect(portalContext(prisma, null, a.brand.slug)).rejects.toThrow(/Sem acesso/);
  });

  it("pessoa da equipe sem participação de creator não tem portal", async () => {
    const { brand } = await seedBrand(prisma);
    const id = randomUUID();
    await prisma.user.create({ data: { id, email: `${id}@x.com`, name: "Ana", roleGrants: { create: { role: "GESTAO", brandId: brand.id } } } });
    const actor = (await loadActor(prisma, id))!;
    expect(await portalHome(prisma, actor)).toBeNull();
    await expect(portalContext(prisma, actor, brand.slug)).rejects.toThrow(/Sem acesso/);
  });

  it("o banco só aceita cor em #RRGGBB", async () => {
    const { brand } = await seedBrand(prisma);
    await expectDbError(prisma.brand.update({ where: { id: brand.id }, data: { primaryColor: "blue" } }), /Brand_colors_hex/);
    await expectDbError(prisma.brand.update({ where: { id: brand.id }, data: { secondaryColor: "#12345" } }), /Brand_colors_hex/);
  });
});

describe("Início do portal (banco real)", () => {
  it("saldo, próxima liberação, vendas e comissão do mês pelo pagamento, últimos lançamentos e cupom", async () => {
    const { portalSummary } = await import("@/lib/portal/home");
    const { commissionEntry } = await import("./fixtures");
    const a = await seedBrand(prisma); // pedido pago em 2026-09-01
    const actor = await loginFor(a.account.id);
    const ctx = await portalContext(prisma, actor, a.brand.slug);
    const T = (iso: string) => new Date(iso);
    const mkOrder = (paidAt: string, extra: Record<string, unknown> = {}) =>
      prisma.order.create({
        data: {
          brandId: a.brand.id, shopifyId: `gid://shopify/Order/${randomUUID()}`, name: `#${randomUUID().slice(0, 4)}`, createdAtShop: T(paidAt),
          paidAt: T(paidAt), financialStatus: "PAID", subtotalCents: 10_000, totalCents: 11_000, discountCodes: [a.coupon.code], shopifyUpdatedAt: T(paidAt), ...extra,
        },
      });
    const oct1 = await mkOrder("2026-10-02T12:00:00Z");
    const oct2 = await mkOrder("2026-10-05T12:00:00Z");
    const cancelled = await mkOrder("2026-10-03T12:00:00Z", { cancelledAt: T("2026-10-04T00:00:00Z") });
    // 1º de outubro às 01:00 UTC ainda é setembro em São Paulo: não conta no mês.
    const lateSep = await mkOrder("2026-10-01T01:00:00Z");
    for (const o of [a.order, oct1, oct2, cancelled, lateSep]) {
      await prisma.orderAttribution.create({ data: { brandId: a.brand.id, orderId: o.id, creatorId: a.creator.id, couponId: a.coupon.id, rateBps: 1500, rule: "first_creator_code", evidenceCodes: [a.coupon.code] } });
    }
    await prisma.couponAssignment.create({ data: { brandId: a.brand.id, couponId: a.coupon.id, creatorId: a.creator.id, validFrom: T("2026-01-01T00:00:00Z") } });
    const ids = { brandId: a.brand.id, creatorId: a.creator.id };
    await prisma.ledgerEntry.createMany({
      data: [
        commissionEntry({ ...ids, orderId: a.order.id }, { availableAt: T("2026-09-08T12:00:00Z"), createdAt: T("2026-09-01T12:05:00Z") }),
        commissionEntry({ ...ids, orderId: oct1.id }, { amountCents: 1_500, availableAt: T("2026-10-09T12:00:00Z"), createdAt: T("2026-10-02T12:05:00Z") }),
        commissionEntry({ ...ids, orderId: oct2.id }, { amountCents: 1_500, availableAt: T("2026-10-12T12:00:00Z"), createdAt: T("2026-10-05T12:05:00Z") }),
        commissionEntry({ ...ids, orderId: oct1.id }, { type: "REVERSAL", amountCents: -500, availableAt: T("2026-10-06T10:00:00Z"), createdAt: T("2026-10-06T10:00:00Z") }),
      ],
    });

    const s = await portalSummary(prisma, ctx, T("2026-10-07T12:00:00Z"));
    expect(s.month).toBe("2026-10");
    expect(s.balance).toEqual({ totalCents: 5_500, heldCents: 3_000, reservedCents: 0, availableCents: 2_500 });
    expect(s.nextReleaseAt?.toISOString()).toBe("2026-10-09T12:00:00.000Z");
    expect([s.salesCount, s.salesCents]).toEqual([2, 20_000]);
    expect(s.commissionCents).toBe(2_500);
    expect(s.recent.map((l) => l.amountCents)).toEqual([-500, 1_500, 1_500, 3_000]);
    expect(s.coupons).toEqual([a.coupon.code]);

    // Outra creator da mesma marca não vê nada disso.
    const other = await prisma.creatorAccount.create({ data: { name: "Outra", email: `${randomUUID()}@x.com` } });
    await prisma.creator.create({ data: { brandId: a.brand.id, accountId: other.id, categories: [] } });
    const otherCtx = await portalContext(prisma, await loginFor(other.id), a.brand.slug);
    const empty = await portalSummary(prisma, otherCtx, T("2026-10-07T12:00:00Z"));
    expect(empty).toMatchObject({ salesCount: 0, commissionCents: 0, recent: [], coupons: [], balance: { totalCents: 0 } });
  });
});

describe("ver como creator (D-VIEWAS, banco real)", () => {
  async function staff(role: "SUPER_ADMIN" | "GESTAO", brandId: string | null) {
    const id = randomUUID();
    await prisma.user.create({ data: { id, email: `${id}@x.com`, name: role, roleGrants: { create: { role, brandId } } } });
    return (await loadActor(prisma, id))!;
  }

  it("super admin vê o portal da creator só para leitura, com registro na auditoria", async () => {
    const a = await seedBrand(prisma);
    const admin = await staff("SUPER_ADMIN", null);
    expect(await startViewAs(prisma, admin, a.creator.id)).toBe(a.brand.slug);
    expect(await prisma.auditLog.count({ where: { action: "portal.view_as", entityId: a.creator.id, actorId: admin.userId } })).toBe(1);
    const ctx = await portalContext(prisma, admin, a.brand.slug, a.creator.id);
    expect(ctx).toMatchObject({ creatorId: a.creator.id, viewAs: { userId: admin.userId } });
    expect(ctx.brands.map((b) => b.slug)).toEqual([a.brand.slug]);
    // Cookie com creator de outra marca que a do endereço não vale.
    const b = await seedBrand(prisma);
    await expect(portalContext(prisma, admin, b.brand.slug, a.creator.id)).rejects.toThrow(/Sem acesso/);
  });

  it("Gestão não usa a visualização; cookie forjado por creator é ignorado", async () => {
    const a = await seedBrand(prisma);
    const gestao = await staff("GESTAO", a.brand.id);
    await expect(startViewAs(prisma, gestao, a.creator.id)).rejects.toThrow(/Só super admin/);
    await expect(portalContext(prisma, gestao, a.brand.slug, a.creator.id)).rejects.toThrow(/Sem acesso/);

    // Outra creator da mesma marca põe o id da colega no cookie: continua vendo só o próprio portal.
    const other = await prisma.creatorAccount.create({ data: { name: "Outra", email: `${randomUUID()}@x.com` } });
    const otherCreator = await prisma.creator.create({ data: { brandId: a.brand.id, accountId: other.id, categories: [] } });
    const ctx = await portalContext(prisma, await loginFor(other.id), a.brand.slug, a.creator.id);
    expect(ctx).toMatchObject({ creatorId: otherCreator.id, viewAs: null });
  });
});

describe("Vendas do portal (banco real)", () => {
  it("só pedidos pagos da creator, por mês do pagamento, sem teste nem não pagos, com situação", async () => {
    const { portalSales } = await import("@/lib/portal/sales");
    const { commissionEntry } = await import("./fixtures");
    const T = (iso: string) => new Date(iso);
    const a = await seedBrand(prisma);
    const ctx = await portalContext(prisma, await loginFor(a.account.id), a.brand.slug);
    const mk = (name: string, paidAt: string | null, extra: Record<string, unknown> = {}) =>
      prisma.order.create({
        data: {
          brandId: a.brand.id, shopifyId: `gid://shopify/Order/${randomUUID()}`, name, createdAtShop: T("2026-09-30T12:00:00Z"),
          paidAt: paidAt ? T(paidAt) : null, financialStatus: paidAt ? "PAID" : "EXPIRED", subtotalCents: 10_000, totalCents: 11_000,
          discountCodes: [a.coupon.code], shopifyUpdatedAt: T("2026-10-01T00:00:00Z"), ...extra,
        },
      });
    const oct = await mk("#OUT", "2026-10-02T12:00:00Z");
    const refunded = await mk("#EST", "2026-10-03T12:00:00Z", { financialStatus: "REFUNDED", subtotalCents: 0 });
    const lateSep = await mk("#SET", "2026-10-01T01:00:00Z"); // ainda setembro em São Paulo
    const unpaid = await mk("#PIX", null);
    const test = await mk("#TST", "2026-10-04T12:00:00Z", { test: true });
    for (const o of [oct, refunded, lateSep, unpaid, test]) {
      await prisma.orderAttribution.create({ data: { brandId: a.brand.id, orderId: o.id, creatorId: a.creator.id, couponId: a.coupon.id, rateBps: 1500, rule: "first_creator_code", evidenceCodes: [a.coupon.code] } });
    }
    const ids = { brandId: a.brand.id, creatorId: a.creator.id };
    await prisma.ledgerEntry.createMany({
      data: [
        commissionEntry({ ...ids, orderId: oct.id }, { amountCents: 1_500, availableAt: T("2026-10-09T12:00:00Z") }),
        commissionEntry({ ...ids, orderId: refunded.id }, { amountCents: 1_500, availableAt: T("2026-10-10T12:00:00Z") }),
        commissionEntry({ ...ids, orderId: refunded.id }, { type: "REVERSAL", amountCents: -1_500, availableAt: T("2026-10-05T12:00:00Z") }),
      ],
    });

    const page = await portalSales(prisma, ctx, { now: T("2026-10-06T12:00:00Z") });
    expect(page.month).toBe("2026-10");
    expect(page.months).toEqual(["2026-10", "2026-09"]);
    expect(page.sales.map((s) => [s.orderName, s.status, s.commissionCents])).toEqual([
      ["#EST", "REVERSED", 0],
      ["#OUT", "HELD", 1_500],
    ]);
    expect(page.totals).toEqual({ count: 1, baseCents: 10_000, commissionCents: 1_500 });
    expect((await portalSales(prisma, ctx, { month: "2026-09" })).sales.map((s) => s.orderName)).toEqual(["#SET"]);
    await expect(portalSales(prisma, ctx, { month: "2026-13" })).rejects.toThrow(/Mês inválido/);

    // Outra creator da mesma marca não vê essas vendas.
    const other = await prisma.creatorAccount.create({ data: { name: "Outra", email: `${randomUUID()}@x.com` } });
    await prisma.creator.create({ data: { brandId: a.brand.id, accountId: other.id, categories: [] } });
    const otherPage = await portalSales(prisma, await portalContext(prisma, await loginFor(other.id), a.brand.slug));
    expect(otherPage.sales).toEqual([]);
  });
});
