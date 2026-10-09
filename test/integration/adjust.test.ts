import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { loadActor } from "@/lib/auth/actor";
import { createAdjustment } from "@/lib/commission/adjust";
import { creatorProfile } from "@/lib/creators/profile";
import { expectDbError, seedBrand, testClient } from "./fixtures";

const prisma = testClient();
afterAll(() => prisma.$disconnect());

async function userWith(role: "SUPER_ADMIN" | "GESTAO" | "PAGAMENTO", brandId: string | null) {
  const id = randomUUID();
  await prisma.user.create({ data: { id, email: `${id}@x.com`, name: role, roleGrants: { create: { role, brandId } } } });
  return (await loadActor(prisma, id))!;
}

describe("ajuste manual (banco real)", () => {
  it("super admin lança bônus e correção com motivo; mesmo envio não lança duas vezes; fica na auditoria e na ficha", async () => {
    const { brand, creator } = await seedBrand(prisma);
    const admin = await userWith("SUPER_ADMIN", null);
    const req = randomUUID();
    expect(await createAdjustment(prisma, admin, { creatorId: creator.id, amountCents: 5_000, reason: "Bônus campanha de outubro", requestId: req })).toEqual({ created: true });
    expect(await createAdjustment(prisma, admin, { creatorId: creator.id, amountCents: 5_000, reason: "Bônus campanha de outubro", requestId: req })).toEqual({ created: false });
    await createAdjustment(prisma, admin, { creatorId: creator.id, amountCents: -1_000, reason: "Correção do bônus", requestId: randomUUID() });

    const entries = await prisma.ledgerEntry.findMany({ where: { creatorId: creator.id, type: "ADJUSTMENT" }, orderBy: { createdAt: "asc" } });
    expect(entries.map((e) => [e.amountCents, e.note, e.createdById])).toEqual([
      [5_000, "Bônus campanha de outubro", admin.userId],
      [-1_000, "Correção do bônus", admin.userId],
    ]);
    expect(await prisma.auditLog.count({ where: { action: "ledger.adjust", entityId: creator.id } })).toBe(2);

    const pagamento = await userWith("PAGAMENTO", brand.id);
    const p = await creatorProfile(prisma, pagamento, creator.id);
    expect(p.adjustments?.map((a) => a.amountCents)).toEqual([-1_000, 5_000]);
    expect(p.canAdjust).toBe(false);
  });

  it("Gestão e Pagamento não ajustam; motivo e valor são obrigatórios", async () => {
    const { brand, creator } = await seedBrand(prisma);
    for (const role of ["GESTAO", "PAGAMENTO"] as const) {
      const u = await userWith(role, brand.id);
      await expect(createAdjustment(prisma, u, { creatorId: creator.id, amountCents: 100, reason: "qualquer motivo", requestId: randomUUID() })).rejects.toThrow(/Só super admin/);
    }
    const admin = await userWith("SUPER_ADMIN", null);
    await expect(createAdjustment(prisma, admin, { creatorId: creator.id, amountCents: 100, reason: " oi ", requestId: randomUUID() })).rejects.toThrow(/motivo/);
    await expect(createAdjustment(prisma, admin, { creatorId: creator.id, amountCents: 0, reason: "motivo ok", requestId: randomUUID() })).rejects.toThrow(/zero/);
  });

  it("o banco recusa ajuste sem motivo ou sem autor", async () => {
    const { brand, creator } = await seedBrand(prisma);
    const base = { brandId: brand.id, creatorId: creator.id, type: "ADJUSTMENT" as const, amountCents: 100, availableAt: new Date() };
    await expectDbError(prisma.ledgerEntry.create({ data: { ...base, idempotencyKey: randomUUID(), createdById: "x" } }), /LedgerEntry_adjustment_has_reason/);
    await expectDbError(prisma.ledgerEntry.create({ data: { ...base, idempotencyKey: randomUUID(), note: "motivo" } }), /LedgerEntry_adjustment_has_reason/);
    await expectDbError(prisma.ledgerEntry.create({ data: { ...base, idempotencyKey: randomUUID(), note: "   ", createdById: "x" } }), /LedgerEntry_adjustment_has_reason/);
  });
});
