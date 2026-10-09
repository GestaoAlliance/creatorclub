import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { loadActor } from "@/lib/auth/actor";
import { portalContext } from "@/lib/portal/context";
import { cancelMyWithdrawal, nfLocation, payWithdrawal, rejectWithdrawal, withdrawalQueue } from "@/lib/withdrawals/decide";
import { requestWithdrawal } from "@/lib/withdrawals/request";
import { commissionEntry, expectDbError, seedBrand, testClient } from "./fixtures";

const prisma = testClient();
afterAll(() => prisma.$disconnect());

const T = (iso: string) => new Date(iso);
const IN_WINDOW = T("2026-10-12T15:00:00Z");
const PDF = new TextEncoder().encode("%PDF-1.4 nota");

async function userWith(role: "PAGAMENTO" | "GESTAO" | "SUPER_ADMIN", brandId: string | null) {
  const id = randomUUID();
  await prisma.user.create({ data: { id, email: `${id}@x.com`, name: role, roleGrants: { create: { role, brandId } } } });
  return (await loadActor(prisma, id))!;
}

/** Creator liberada, com R$ 800 disponíveis e um pedido de saque de R$ 600 em análise. */
async function requested() {
  const a = await seedBrand(prisma);
  const userId = randomUUID();
  await prisma.user.create({ data: { id: userId, email: `${userId}@x.com`, name: "Creator" } });
  await prisma.creatorAccount.update({ where: { id: a.account.id }, data: { userId, pixKey: "pix@exemplo.com", cpf: "12345678900" } });
  await prisma.creator.update({ where: { id: a.creator.id }, data: { withdrawalsUnlockedAt: T("2026-10-01T00:00:00Z"), withdrawalsUnlockedById: "pagamento" } });
  await prisma.ledgerEntry.create({ data: commissionEntry({ brandId: a.brand.id, creatorId: a.creator.id, orderId: a.order.id }, { amountCents: 80_000, availableAt: T("2026-09-08T12:00:00Z") }) });
  const ctx = await portalContext(prisma, (await loadActor(prisma, userId))!, a.brand.slug);
  const { withdrawalId } = await requestWithdrawal(prisma, ctx, { actorUserId: userId, requestId: randomUUID(), amountCents: 60_000, pdf: PDF }, IN_WINDOW);
  const pagamento = await userWith("PAGAMENTO", a.brand.id);
  return { ...a, ctx, userId, withdrawalId, pagamento };
}

const sum = async (creatorId: string) => (await prisma.ledgerEntry.aggregate({ where: { creatorId }, _sum: { amountCents: true } }))._sum.amountCents;

describe("decisão do saque (banco real)", () => {
  it("fila mostra o pedido com Pix, documento e disponível; pagar lança o saque no extrato uma vez só", async () => {
    const s = await requested();
    const queue = await withdrawalQueue(prisma, s.pagamento, "REQUESTED", IN_WINDOW);
    expect(queue.find((r) => r.id === s.withdrawalId)).toMatchObject({ amountCents: 60_000, pixKey: "pix@exemplo.com", document: "12345678900", hasNf: true, availableBeforeCents: 80_000 });
    expect(await nfLocation(prisma, s.pagamento, s.withdrawalId)).toMatchObject({ bucket: "nf" });

    const results = await Promise.allSettled([1, 2].map(() => payWithdrawal(prisma, s.pagamento, s.withdrawalId, IN_WINDOW)));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await sum(s.creator.id)).toBe(20_000);
    const w = await prisma.withdrawal.findUniqueOrThrow({ where: { id: s.withdrawalId }, include: { ledgerEntries: true } });
    expect(w).toMatchObject({ status: "PAID", decidedById: s.pagamento.userId });
    expect(w.ledgerEntries).toMatchObject([{ type: "WITHDRAWAL", amountCents: -60_000 }]);
    await expect(rejectWithdrawal(prisma, s.pagamento, s.withdrawalId, "tarde")).rejects.toThrow(/já foi decidido/);
    expect((await withdrawalQueue(prisma, s.pagamento, "DECIDED")).find((r) => r.id === s.withdrawalId)?.status).toBe("PAID");
    expect(await prisma.auditLog.count({ where: { action: "withdrawal.paid", entityId: s.withdrawalId } })).toBe(1);
  });

  it("recusar exige motivo, não mexe no extrato e libera novo pedido", async () => {
    const s = await requested();
    await expect(rejectWithdrawal(prisma, s.pagamento, s.withdrawalId, "  ")).rejects.toThrow(/motivo/);
    await rejectWithdrawal(prisma, s.pagamento, s.withdrawalId, " Valor da nota   diferente do pedido ");
    expect(await prisma.withdrawal.findUniqueOrThrow({ where: { id: s.withdrawalId } })).toMatchObject({ status: "REJECTED", note: "Valor da nota diferente do pedido" });
    expect(await sum(s.creator.id)).toBe(80_000);
    const again = await requestWithdrawal(prisma, s.ctx, { actorUserId: s.userId, requestId: randomUUID(), amountCents: 50_000, pdf: PDF }, IN_WINDOW);
    expect(again.created).toBe(true);
  });

  it("creator cancela o próprio pedido em análise; não cancela de outra nem na visualização da equipe", async () => {
    const s = await requested();
    const other = await requested();
    await expect(cancelMyWithdrawal(prisma, other.ctx, other.userId, s.withdrawalId)).rejects.toThrow(/não encontrado/);
    await expect(cancelMyWithdrawal(prisma, { ...s.ctx, viewAs: { userId: "sa" } }, s.userId, s.withdrawalId)).rejects.toThrow(/Visualização/);
    await cancelMyWithdrawal(prisma, s.ctx, s.userId, s.withdrawalId);
    expect(await prisma.withdrawal.findUniqueOrThrow({ where: { id: s.withdrawalId } })).toMatchObject({ status: "CANCELLED", decidedById: s.userId });
    await expect(payWithdrawal(prisma, s.pagamento, s.withdrawalId)).rejects.toThrow(/já foi decidido/);
    await expect(cancelMyWithdrawal(prisma, s.ctx, s.userId, s.withdrawalId)).rejects.toThrow(/já foi decidido/);
  });

  it("só Pagamento e super admin da marca decidem; Gestão não vê a fila", async () => {
    const s = await requested();
    const gestao = await userWith("GESTAO", s.brand.id);
    const otherBrand = await seedBrand(prisma);
    const pagOutra = await userWith("PAGAMENTO", otherBrand.brand.id);
    await expect(withdrawalQueue(prisma, gestao)).rejects.toThrow(/permissão/);
    await expect(payWithdrawal(prisma, gestao, s.withdrawalId)).rejects.toThrow(/permissão/);
    await expect(payWithdrawal(prisma, pagOutra, s.withdrawalId)).rejects.toThrow(/permissão/);
    await expect(nfLocation(prisma, pagOutra, s.withdrawalId)).rejects.toThrow(/permissão/);
    expect((await withdrawalQueue(prisma, pagOutra)).some((r) => r.id === s.withdrawalId)).toBe(false);
    const sa = await userWith("SUPER_ADMIN", null);
    await payWithdrawal(prisma, sa, s.withdrawalId);
  });

  it("travas do banco: recusa sem motivo, decisão sem autor, dois lançamentos do mesmo saque", async () => {
    const s = await requested();
    const now = new Date();
    await expectDbError(prisma.withdrawal.update({ where: { id: s.withdrawalId }, data: { status: "REJECTED", decidedAt: now, decidedById: "x", note: " " } }), /Withdrawal_rejected_has_note/);
    await expectDbError(prisma.withdrawal.update({ where: { id: s.withdrawalId }, data: { status: "CANCELLED", decidedAt: now } }), /Withdrawal_decided_has_author/);
    await payWithdrawal(prisma, s.pagamento, s.withdrawalId);
    await expectDbError(
      prisma.ledgerEntry.create({ data: { brandId: s.brand.id, creatorId: s.creator.id, type: "WITHDRAWAL", amountCents: -1, withdrawalId: s.withdrawalId, availableAt: now, idempotencyKey: randomUUID() } }),
      /LedgerEntry_one_payment_per_withdrawal/,
    );
  });
});
