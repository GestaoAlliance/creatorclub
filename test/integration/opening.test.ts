import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { loadActor } from "@/lib/auth/actor";
import { approveOpening, markReviewed, openingList } from "@/lib/withdrawals/opening";
import { commissionEntry, expectDbError, letters, seedBrand, testClient } from "./fixtures";

const prisma = testClient();
afterAll(() => prisma.$disconnect());

async function userWith(role: "PAGAMENTO" | "GESTAO" | "SUPER_ADMIN", brandId: string | null) {
  const id = randomUUID();
  await prisma.user.create({ data: { id, email: `${id}@x.com`, name: role, roleGrants: { create: { role, brandId } } } });
  return (await loadActor(prisma, id))!;
}

/** Creator com R$ 500 de comissão; cupom e taxa confirmados e conferida pela Ana (ou não). */
async function creator(confirmed = true, reviewed = confirmed) {
  const a = await seedBrand(prisma);
  const since = new Date("2026-06-01T03:00:00Z");
  const at = confirmed ? new Date() : null;
  await prisma.couponAssignment.create({ data: { brandId: a.brand.id, couponId: a.coupon.id, creatorId: a.creator.id, validFrom: since, confirmedAt: at, confirmedById: at ? "ana" : null } });
  await prisma.commissionPolicy.create({ data: { brandId: a.brand.id, creatorId: a.creator.id, rateBps: 1500, validFrom: since, confirmedAt: at, confirmedById: at ? "ana" : null } });
  await prisma.ledgerEntry.create({ data: commissionEntry({ brandId: a.brand.id, creatorId: a.creator.id, orderId: a.order.id }, { amountCents: 50_000 }) });
  if (reviewed) await prisma.creator.update({ where: { id: a.creator.id }, data: { reviewedAt: new Date(), reviewedById: "ana" } });
  const pagamento = await userWith("PAGAMENTO", a.brand.id);
  return { ...a, pagamento };
}

describe("saldo de abertura (banco real)", () => {
  it("lista com a comissão; aprovar lança o já pago (negativo), libera o saque e não aprova duas vezes", async () => {
    const c = await creator();
    const before = (await openingList(prisma, c.pagamento)).find((r) => r.creatorId === c.creator.id);
    expect(before).toMatchObject({ ledgerCents: 50_000, ready: true, unlockedAt: null, openingCents: null });

    const results = await Promise.allSettled(
      [1, 2].map(() => approveOpening(prisma, c.pagamento, { creatorId: c.creator.id, alreadyPaidCents: 30_000, note: "Pix 15/07" })),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(String((results.find((r) => r.status === "rejected") as PromiseRejectedResult).reason)).toMatch(/já foi aprovado/);
    expect((results.find((r) => r.status === "fulfilled") as PromiseFulfilledResult<{ balanceCents: number }>).value.balanceCents).toBe(20_000);

    const after = (await openingList(prisma, c.pagamento)).find((r) => r.creatorId === c.creator.id);
    expect(after).toMatchObject({ ledgerCents: 20_000, openingCents: -30_000, openingNote: "Já pago antes do Creator Club: Pix 15/07" });
    expect(after!.unlockedAt).not.toBeNull();
    expect(await prisma.auditLog.count({ where: { action: "creator.opening_approved", entityId: c.creator.id } })).toBe(1);
  });

  it("nada pago: só libera; já pago maior que a comissão: aceita e fica negativo", async () => {
    const zero = await creator();
    expect(await approveOpening(prisma, zero.pagamento, { creatorId: zero.creator.id, alreadyPaidCents: 0, note: "" })).toEqual({ balanceCents: 50_000 });
    expect(await prisma.ledgerEntry.count({ where: { creatorId: zero.creator.id, type: "OPENING_BALANCE" } })).toBe(0);

    const neg = await creator();
    expect(await approveOpening(prisma, neg.pagamento, { creatorId: neg.creator.id, alreadyPaidCents: 70_000, note: "Pix" })).toEqual({ balanceCents: -20_000 });
  });

  it("recusa: antes da Ana, sem observação, valor negativo, sem permissão", async () => {
    const pending = await creator(false);
    expect((await openingList(prisma, pending.pagamento)).find((r) => r.creatorId === pending.creator.id)?.ready).toBe(false);
    await expect(approveOpening(prisma, pending.pagamento, { creatorId: pending.creator.id, alreadyPaidCents: 0, note: "" })).rejects.toThrow(/Ana/);

    const c = await creator();
    await expect(approveOpening(prisma, c.pagamento, { creatorId: c.creator.id, alreadyPaidCents: 100, note: " " })).rejects.toThrow(/Descreva/);
    await expect(approveOpening(prisma, c.pagamento, { creatorId: c.creator.id, alreadyPaidCents: -1, note: "x" })).rejects.toThrow(/já foi pago/);
    const gestao = await userWith("GESTAO", c.brand.id);
    await expect(approveOpening(prisma, gestao, { creatorId: c.creator.id, alreadyPaidCents: 0, note: "" })).rejects.toThrow(/permissão/);
    await expect(openingList(prisma, gestao)).rejects.toThrow(/permissão/);
    expect((await prisma.creator.findUniqueOrThrow({ where: { id: c.creator.id } })).withdrawalsUnlockedAt).toBeNull();
  });

  it("Ana marca 'conferi' (Gestão ou super admin); antes disso a abertura fica travada mesmo com taxa confirmada", async () => {
    const c = await creator(true, false);
    expect((await openingList(prisma, c.pagamento)).find((r) => r.creatorId === c.creator.id)?.ready).toBe(false);
    await expect(approveOpening(prisma, c.pagamento, { creatorId: c.creator.id, alreadyPaidCents: 0, note: "" })).rejects.toThrow(/Ana/);
    await expect(markReviewed(prisma, c.pagamento, c.creator.id)).rejects.toThrow(/permissão/);
    const ana = await userWith("SUPER_ADMIN", null);
    await markReviewed(prisma, ana, c.creator.id);
    await expect(markReviewed(prisma, ana, c.creator.id)).rejects.toThrow(/já foi conferida/);
    expect(await prisma.auditLog.count({ where: { action: "creator.reviewed", entityId: c.creator.id } })).toBe(1);
    await approveOpening(prisma, c.pagamento, { creatorId: c.creator.id, alreadyPaidCents: 0, note: "" });
  });

  it("trava do banco: conferência sem autor", async () => {
    const c = await creator(true, false);
    await expectDbError(prisma.creator.update({ where: { id: c.creator.id }, data: { reviewedAt: new Date() } }), /Creator_review_has_author/);
  });

  it("trava do banco: uma abertura por creator", async () => {
    const c = await creator();
    const row = { brandId: c.brand.id, creatorId: c.creator.id, type: "OPENING_BALANCE" as const, amountCents: -1, availableAt: new Date() };
    await prisma.ledgerEntry.create({ data: { ...row, idempotencyKey: `t:${letters()}` } });
    await expectDbError(prisma.ledgerEntry.create({ data: { ...row, idempotencyKey: `t:${letters()}` } }), /LedgerEntry_one_opening_per_creator/);
  });
});
