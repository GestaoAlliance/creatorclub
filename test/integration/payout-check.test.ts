import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { loadActor } from "@/lib/auth/actor";
import { payCheckRows, recordPayCheck, reviewText } from "@/lib/payouts/check";
import { commissionEntry, expectDbError, seedBrand, testClient } from "./fixtures";

const prisma = testClient();
afterAll(() => prisma.$disconnect());
const T = (iso: string) => new Date(iso);

async function staff(role: "GESTAO" | "ENVIO", brandId: string) {
  const id = randomUUID();
  await prisma.user.create({ data: { id, email: `${id}@x.com`, name: `${role} Teste`, roleGrants: { create: { role, brandId } } } });
  return (await loadActor(prisma, id))!;
}

describe("conferência do saque (D-PAYCHECK, banco real)", () => {
  it("vendas × % bate com o disponível; conferido grava o valor; ajuste depois deixa a conferência velha; travas no banco", async () => {
    const a = await seedBrand(prisma); // pedido de R$ 200 pago em 01/09
    await prisma.orderAttribution.create({ data: { brandId: a.brand.id, orderId: a.order.id, creatorId: a.creator.id, couponId: a.coupon.id, rateBps: 1500, rule: "first_creator_code", evidenceCodes: [a.coupon.code] } });
    await prisma.ledgerEntry.create({ data: commissionEntry({ brandId: a.brand.id, creatorId: a.creator.id, orderId: a.order.id }) }); // R$ 30
    await prisma.commissionRelease.create({ data: { brandId: a.brand.id, creatorId: a.creator.id, month: "2026-09", salesCents: 20_000, minCents: 100 } });
    await prisma.commissionPolicy.create({ data: { brandId: a.brand.id, creatorId: a.creator.id, rateBps: 1500, validFrom: T("2026-01-01T03:00:00Z"), confirmedAt: T("2026-01-02T00:00:00Z"), confirmedById: "x" } });
    const now = T("2026-10-10T15:00:00Z");

    let { month, rows } = await payCheckRows(prisma, a.brand.id, null, now);
    expect(month).toBe("2026-09");
    expect(rows).toEqual([expect.objectContaining({ creatorId: a.creator.id, salesCents: 20_000, rateBps: 1500, expectedCents: 3_000, systemCents: 3_000, matches: true, check: null, withdrawal: null })]);

    await expect(recordPayCheck(prisma, await staff("ENVIO", a.brand.id), a.creator.id, "CHECKED", null, now)).rejects.toThrow(/Só quem aprova/);
    const gestao = await staff("GESTAO", a.brand.id);
    expect(rows[0]!.hasPix).toBe(false);
    await recordPayCheck(prisma, gestao, a.creator.id, "CHECKED", null, now);
    await recordPayCheck(prisma, gestao, a.creator.id, "CHECKED", null, now); // clique duplo: não grava de novo
    expect(await prisma.payoutCheck.count({ where: { creatorId: a.creator.id } })).toBe(1);
    await prisma.creatorAccount.update({ where: { id: a.account.id }, data: { pixKey: "pix@exemplo.com" } });
    rows = (await payCheckRows(prisma, a.brand.id, null, now)).rows;
    expect(rows[0]!.hasPix).toBe(true);
    expect(rows[0]!.check).toMatchObject({ status: "CHECKED", amountCents: 3_000, stale: false, by: "GESTAO Teste" });

    // Ajuste da equipe depois: o valor muda, não bate mais e a conferência fica velha.
    await prisma.ledgerEntry.create({ data: { brandId: a.brand.id, creatorId: a.creator.id, type: "ADJUSTMENT", amountCents: 500, availableAt: T("2026-10-01T00:00:00Z"), idempotencyKey: `adj:${randomUUID()}`, note: "bônus", createdById: "x", createdAt: T("2026-10-01T00:00:00Z") } });
    const r = (await payCheckRows(prisma, a.brand.id, null, now)).rows[0]!;
    expect(r).toMatchObject({ systemCents: 3_500, matches: false, check: expect.objectContaining({ stale: true }) });
    expect(r.reasons).toEqual([{ label: "ajustes da equipe", cents: 500 }]);
    await recordPayCheck(prisma, gestao, a.creator.id, "REVIEW", null, now);
    expect(reviewText(r, "Botanika")).toMatch(/\*Conferência de saque · Botanika\*[\s\S]*No Creator Club: \*R\$\s?35,00\*[\s\S]*ajustes da equipe: \+ R\$\s?5,00/);

    await expectDbError(prisma.payoutCheck.create({ data: { brandId: a.brand.id, creatorId: a.creator.id, month: "2026-13", status: "CHECKED", amountCents: 1, expectedCents: 1, createdById: "x" } }), /PayoutCheck_valid/);
    const last = await prisma.payoutCheck.findFirstOrThrow({ where: { creatorId: a.creator.id } });
    await expectDbError(prisma.payoutCheck.update({ where: { id: last.id }, data: { amountCents: 1 } }), /somente inserção|insert_only|não pode ser alterad/i);
  });
});
