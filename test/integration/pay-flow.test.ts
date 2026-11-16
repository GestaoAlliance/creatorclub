import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { loadActor } from "@/lib/auth/actor";
import { portalContext } from "@/lib/portal/context";
import { payMonthBoard, payRowsCsv } from "@/lib/payouts/month-board";
import { approveWithdrawal, payWithdrawals } from "@/lib/withdrawals/decide";
import { requestWithdrawalWithReceipt } from "@/lib/withdrawals/request";
import { commissionEntry, expectDbError, seedBrand, testClient } from "./fixtures";

const prisma = testClient();
afterAll(() => prisma.$disconnect());

const T = (iso: string) => new Date(iso);
const IN_WINDOW = T("2026-11-03T15:00:00Z");

async function staff(role: "GESTAO" | "PAGAMENTO" | "ENVIO", brandId: string) {
  const id = randomUUID();
  await prisma.user.create({ data: { id, email: `${id}@x.com`, name: role === "PAGAMENTO" ? "Guilherme" : role, roleGrants: { create: { role, brandId } } } });
  return (await loadActor(prisma, id))!;
}

describe("Pagamentos CNPJ/CPF por mês da comissão (D-PAYFLOW, banco real)", () => {
  it("pedido grava o mês e a conta da nota; passa por aprovar → realizar → realizados; quem não pediu aparece", async () => {
    const a = await seedBrand(prisma); // pedido pago em 01/09: comissão de setembro
    const userId = randomUUID();
    await prisma.user.create({ data: { id: userId, email: `${userId}@x.com`, name: "Creator" } });
    await prisma.creatorAccount.update({ where: { id: a.account.id }, data: { userId, pixKey: "pix@exemplo.com", cpf: "52998224725", name: "Maria Exemplo da Silva" } });
    await prisma.creator.update({ where: { id: a.creator.id }, data: { withdrawalsUnlockedAt: T("2026-10-01T00:00:00Z"), withdrawalsUnlockedById: "p", receivesAsIndividual: true } });
    await prisma.ledgerEntry.create({ data: commissionEntry({ brandId: a.brand.id, creatorId: a.creator.id, orderId: a.order.id }, { amountCents: 3_000, availableAt: T("2026-10-08T12:00:00Z") }) });
    await prisma.commissionRelease.create({ data: { brandId: a.brand.id, creatorId: a.creator.id, month: "2026-10", salesCents: 20_000, minCents: 100 } });
    await prisma.commissionPolicy.create({ data: { brandId: a.brand.id, creatorId: a.creator.id, rateBps: 1500, validFrom: T("2026-01-01T03:00:00Z"), confirmedAt: T("2026-01-02T00:00:00Z"), confirmedById: "x" } });
    const pag = await staff("PAGAMENTO", a.brand.id);
    const gestao = await staff("GESTAO", a.brand.id);

    // Antes do pedido: aparece em "Ainda não enviaram" com o valor da nota.
    let b = await payMonthBoard(prisma, pag, a.brand.id, "CPF", "aprovar", undefined, IN_WINDOW);
    expect(b.month).toBe("2026-10");
    expect(b.waiting).toEqual([expect.objectContaining({ id: a.creator.id, nfCents: 3_000, commissionCents: 0 })]);
    expect((await payMonthBoard(prisma, pag, a.brand.id, "CNPJ", "aprovar", undefined, IN_WINDOW)).waiting).toEqual([]);

    const ctx = await portalContext(prisma, (await loadActor(prisma, userId))!, a.brand.slug);
    const r = await requestWithdrawalWithReceipt(prisma, ctx, { actorUserId: userId, requestId: randomUUID(), amountCents: 3_000, fullName: "Maria Exemplo da Silva", cpf: "529.982.247-25", accept: true }, IN_WINDOW);
    const w = await prisma.withdrawal.findUniqueOrThrow({ where: { id: r.withdrawalId } });
    expect(w.referenceMonth).toBe("2026-10");
    expect(w.breakdown).toEqual([{ key: "c:2026-09", label: "Comissão de setembro", cents: 3_000, month: "2026-09" }]);

    b = await payMonthBoard(prisma, pag, a.brand.id, "CPF", "aprovar", "2026-10", IN_WINDOW);
    expect(b.waiting).toEqual([]);
    expect(b.rows).toEqual([expect.objectContaining({ name: "Maria Exemplo da Silva", nfCents: 3_000, commissionCents: 0, rateBps: 1500, diff: [{ label: "comissão de setembro", cents: 3_000 }], canApprove: true })]);
    expect(b.stages.aprovar).toMatchObject({ count: 1, cents: 3_000 });

    await approveWithdrawal(prisma, gestao, w.id, IN_WINDOW);
    b = await payMonthBoard(prisma, pag, a.brand.id, "CPF", "realizar", "2026-10", IN_WINDOW);
    expect(b.rows).toEqual([expect.objectContaining({ canPay: true, approvedAt: IN_WINDOW, document: "52998224725", pixKey: "pix@exemplo.com" })]);
    expect(payRowsCsv(b.rows, "Botanika", b.month)).toMatch(/Botanika;10\/2026;Maria Exemplo da Silva;.*;30,00;comissão de setembro: mais 30,00;/);

    await payWithdrawals(prisma, pag, [w.id], T("2026-11-20T15:00:00Z"));
    await prisma.legacyPayout.create({ data: { brandId: a.brand.id, creatorId: a.creator.id, amountCents: 1_000, paidOn: T("2026-10-05"), note: "Pix SICOOB 05/10", createdById: pag.userId } });
    b = await payMonthBoard(prisma, pag, a.brand.id, "CPF", "realizados", "2026-10", T("2026-11-21T12:00:00Z"));
    expect(b.rows.map((x) => [x.legacy, x.nfCents, x.paidDay, x.paidBy])).toEqual([[false, 3_000, "2026-11-20", "Guilherme"], [true, 1_000, "2026-10-05", null]]);
    expect(b.stages.realizados).toMatchObject({ count: 1, cents: 3_000 });

    await expect(payMonthBoard(prisma, await staff("ENVIO", a.brand.id), a.brand.id, "CPF", "aprovar", undefined)).rejects.toThrow(/Sem permissão/);
    await expectDbError(prisma.withdrawal.update({ where: { id: w.id }, data: { referenceMonth: "2026-13" } }), /Withdrawal_reference_month/);
  });
});
