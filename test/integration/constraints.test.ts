import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { commissionEntry, expectDbError, seedBrand, testClient } from "./fixtures";

const prisma = testClient();
afterAll(() => prisma.$disconnect());

describe("extrato (LedgerEntry)", () => {
  it("aceita um crédito válido e recusa a mesma chave de idempotência duas vezes", async () => {
    const { brand, creator, order } = await seedBrand(prisma);
    const entry = commissionEntry({ brandId: brand.id, creatorId: creator.id, orderId: order.id });
    await prisma.ledgerEntry.create({ data: entry });
    await expectDbError(prisma.ledgerEntry.create({ data: entry }), /LedgerEntry_idempotencyKey_key|idempotencyKey/);
  });

  it("é somente inserção: não deixa editar nem apagar", async () => {
    const { brand, creator, order } = await seedBrand(prisma);
    const created = await prisma.ledgerEntry.create({
      data: commissionEntry({ brandId: brand.id, creatorId: creator.id, orderId: order.id }),
    });
    await expectDbError(
      prisma.ledgerEntry.update({ where: { id: created.id }, data: { amountCents: 1 } }),
      /somente inserção: UPDATE/,
    );
    await expectDbError(prisma.ledgerEntry.delete({ where: { id: created.id } }), /somente inserção: DELETE/);
  });

  it("recusa sinal errado, valor zero e crédito sem pedido", async () => {
    const { brand, creator, order } = await seedBrand(prisma);
    const ids = { brandId: brand.id, creatorId: creator.id, orderId: order.id };
    await expectDbError(prisma.ledgerEntry.create({ data: commissionEntry(ids, { amountCents: -100 }) }), /LedgerEntry_sign_by_type/);
    await expectDbError(
      prisma.ledgerEntry.create({ data: commissionEntry(ids, { type: "REVERSAL", amountCents: 100 }) }),
      /LedgerEntry_sign_by_type/,
    );
    await expectDbError(
      prisma.ledgerEntry.create({ data: commissionEntry(ids, { type: "ADJUSTMENT", amountCents: 0 }) }),
      /LedgerEntry_amount_nonzero/,
    );
    await expectDbError(prisma.ledgerEntry.create({ data: commissionEntry(ids, { orderId: null }) }), /LedgerEntry_order_required/);
    // Ajuste manual pode ser positivo ou negativo e não exige pedido.
    await prisma.ledgerEntry.create({
      data: commissionEntry(ids, { type: "ADJUSTMENT", amountCents: -500, orderId: null }),
    });
  });

  it("não mistura marcas: creator da marca A não entra no extrato da marca B", async () => {
    const a = await seedBrand(prisma);
    const b = await seedBrand(prisma);
    await expectDbError(
      prisma.ledgerEntry.create({
        data: commissionEntry({ brandId: b.brand.id, creatorId: a.creator.id, orderId: b.order.id }),
      }),
      /LedgerEntry_creatorId_brandId_fkey/,
    );
  });
});

describe("nada financeiro é apagado", () => {
  it("não apaga creator nem marca que já têm movimento", async () => {
    const { brand, creator, order } = await seedBrand(prisma);
    await prisma.ledgerEntry.create({
      data: commissionEntry({ brandId: brand.id, creatorId: creator.id, orderId: order.id }),
    });
    await expectDbError(prisma.creator.delete({ where: { id: creator.id } }), /_fkey/);
    await expectDbError(prisma.brand.delete({ where: { id: brand.id } }), /_fkey/);
  });
});

describe("saques", () => {
  const withdrawal = (brandId: string, creatorId: string, extra: Record<string, unknown> = {}) => ({
    brandId,
    creatorId,
    amountCents: 50_000,
    idempotencyKey: `withdrawal:${randomUUID()}`,
    ...extra,
  });

  it("no máximo um saque em aberto por creator", async () => {
    const { brand, creator } = await seedBrand(prisma);
    const first = await prisma.withdrawal.create({ data: withdrawal(brand.id, creator.id) });
    await expectDbError(prisma.withdrawal.create({ data: withdrawal(brand.id, creator.id) }), /Withdrawal_one_open_per_creator/);

    await prisma.withdrawal.update({
      where: { id: first.id },
      data: { status: "PAID", decidedAt: new Date() },
    });
    await expect(prisma.withdrawal.create({ data: withdrawal(brand.id, creator.id) })).resolves.toBeTruthy();
  });

  it("valor precisa ser positivo e decisão precisa de data", async () => {
    const { brand, creator } = await seedBrand(prisma);
    await expectDbError(prisma.withdrawal.create({ data: withdrawal(brand.id, creator.id, { amountCents: 0 }) }), /Withdrawal_amount_positive/);
    await expectDbError(
      prisma.withdrawal.create({ data: withdrawal(brand.id, creator.id, { status: "PAID" }) }),
      /Withdrawal_decided_consistent/,
    );
  });
});

describe("taxa de comissão com vigência", () => {
  it("aceita períodos encadeados e recusa sobreposição", async () => {
    const { brand, creator } = await seedBrand(prisma);
    const base = { brandId: brand.id, creatorId: creator.id };
    await prisma.commissionPolicy.create({
      data: { ...base, rateBps: 1000, validFrom: new Date("2026-01-01T03:00:00Z"), validTo: new Date("2026-09-15T03:00:00Z") },
    });
    await prisma.commissionPolicy.create({
      data: { ...base, rateBps: 1500, validFrom: new Date("2026-09-15T03:00:00Z") },
    });
    await expectDbError(
      prisma.commissionPolicy.create({ data: { ...base, rateBps: 1200, validFrom: new Date("2026-10-01T03:00:00Z") } }),
      /CommissionPolicy_no_overlap/,
    );
  });

  it("recusa taxa acima de 100% e período invertido", async () => {
    const { brand, creator } = await seedBrand(prisma);
    const base = { brandId: brand.id, creatorId: creator.id };
    await expectDbError(
      prisma.commissionPolicy.create({ data: { ...base, rateBps: 10_001, validFrom: new Date() } }),
      /CommissionPolicy_rateBps_range/,
    );
    await expectDbError(
      prisma.commissionPolicy.create({
        data: { ...base, rateBps: 1500, validFrom: new Date("2026-10-01T00:00:00Z"), validTo: new Date("2026-09-01T00:00:00Z") },
      }),
      /CommissionPolicy_period_valid/,
    );
  });
});

describe("cupons", () => {
  it("código único por marca, em maiúsculas; o mesmo código pode existir em outra marca", async () => {
    const a = await seedBrand(prisma);
    const b = await seedBrand(prisma);
    await expectDbError(
      prisma.coupon.create({ data: { brandId: a.brand.id, code: a.coupon.code, kind: "PROMO", classifiedAt: new Date(), classifiedById: "seed" } }),
      /Coupon_brandId_code_key|brandId.*code/,
    );
    await expectDbError(
      prisma.coupon.create({ data: { brandId: a.brand.id, code: "minusculo", kind: "PROMO", classifiedAt: new Date(), classifiedById: "seed" } }),
      /Coupon_code_uppercase/,
    );
    await expect(
      prisma.coupon.create({ data: { brandId: b.brand.id, code: a.coupon.code, kind: "PROMO", classifiedAt: new Date(), classifiedById: "seed" } }),
    ).resolves.toBeTruthy();
  });

  it("um cupom tem no máximo uma dona por vez", async () => {
    const { brand, creator, coupon } = await seedBrand(prisma);
    const otherAccount = await prisma.creatorAccount.create({
      data: { name: "Outra", email: `outra-${randomUUID()}@example.com` },
    });
    const other = await prisma.creator.create({
      data: { brandId: brand.id, accountId: otherAccount.id, categories: ["INFLUENCER"] },
    });
    const base = { brandId: brand.id, couponId: coupon.id };
    await prisma.couponAssignment.create({
      data: { ...base, creatorId: creator.id, validFrom: new Date("2026-01-01T00:00:00Z"), validTo: new Date("2026-06-01T00:00:00Z") },
    });
    await prisma.couponAssignment.create({
      data: { ...base, creatorId: other.id, validFrom: new Date("2026-06-01T00:00:00Z") },
    });
    await expectDbError(
      prisma.couponAssignment.create({ data: { ...base, creatorId: creator.id, validFrom: new Date("2026-07-01T00:00:00Z") } }),
      /CouponAssignment_no_overlap/,
    );
  });
});

describe("papéis da equipe", () => {
  it("só SUPER_ADMIN pode valer para todas as marcas e papéis não se repetem", async () => {
    const { brand } = await seedBrand(prisma);
    const user = await prisma.user.create({
      data: { id: randomUUID(), email: `staff-${randomUUID()}@example.com`, name: "Equipe" },
    });
    await expectDbError(prisma.roleGrant.create({ data: { userId: user.id, role: "GESTAO" } }), /RoleGrant_global_only_super_admin/);
    await prisma.roleGrant.create({ data: { userId: user.id, role: "SUPER_ADMIN" } });
    await expectDbError(prisma.roleGrant.create({ data: { userId: user.id, role: "SUPER_ADMIN" } }), /RoleGrant_global_user_role_key|userId.*role/);
    await prisma.roleGrant.create({ data: { userId: user.id, brandId: brand.id, role: "GESTAO" } });
    await expectDbError(
      prisma.roleGrant.create({ data: { userId: user.id, brandId: brand.id, role: "GESTAO" } }),
      /RoleGrant_userId_brandId_role_key|userId.*brandId.*role/,
    );
  });
});

describe("auditoria", () => {
  it("é somente inserção", async () => {
    const log = await prisma.auditLog.create({
      data: { actorType: "SYSTEM", action: "teste", entity: "Brand", entityId: "x" },
    });
    await expectDbError(prisma.auditLog.delete({ where: { id: log.id } }), /somente inserção: DELETE/);
  });
});

describe("a confirmar (D-CLASS / D-RATEIMPORT)", () => {
  it("cupom sem tipo é aceito; tipo sem autor/data, ou autor sem tipo, é recusado", async () => {
    const { brand } = await seedBrand(prisma);
    await expect(prisma.coupon.create({ data: { brandId: brand.id, code: "SEMTIPO" } })).resolves.toMatchObject({ kind: null });
    await expectDbError(prisma.coupon.create({ data: { brandId: brand.id, code: "SOTIPO", kind: "PROMO" } }), /Coupon_classified_consistent/);
    await expectDbError(
      prisma.coupon.create({ data: { brandId: brand.id, code: "SOAUTOR", classifiedAt: new Date(), classifiedById: "ana" } }),
      /Coupon_classified_consistent/,
    );
  });

  it("dona e taxa confirmadas sempre com autor", async () => {
    const { brand, creator, coupon } = await seedBrand(prisma);
    await expectDbError(
      prisma.couponAssignment.create({
        data: { brandId: brand.id, couponId: coupon.id, creatorId: creator.id, validFrom: new Date("2026-01-01T00:00:00Z"), confirmedAt: new Date() },
      }),
      /CouponAssignment_confirmed_has_author/,
    );
    await expectDbError(
      prisma.commissionPolicy.create({
        data: { brandId: brand.id, creatorId: creator.id, rateBps: 1500, validFrom: new Date("2026-01-01T00:00:00Z"), confirmedById: "ana" },
      }),
      /CommissionPolicy_confirmed_has_author/,
    );
    await expect(
      prisma.commissionPolicy.create({ data: { brandId: brand.id, creatorId: creator.id, rateBps: 1500, validFrom: new Date("2026-01-01T00:00:00Z") } }),
    ).resolves.toMatchObject({ confirmedAt: null });
  });
});
