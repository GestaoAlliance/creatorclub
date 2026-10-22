import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { loadActor } from "@/lib/auth/actor";
import { portalContext } from "@/lib/portal/context";
import { approveWithdrawal, cancelMyWithdrawal, nfLocation, payWithdrawal, recheckWithdrawalNf, rejectWithdrawal, withdrawalQueue } from "@/lib/withdrawals/decide";
import { payoutSummary } from "@/lib/withdrawals/summary";
import { staffHome } from "@/lib/staff/home";
import { requestWithdrawal } from "@/lib/withdrawals/request";
import { commissionEntry, expectDbError, seedBrand, testClient } from "./fixtures";

const prisma = testClient();
afterAll(() => prisma.$disconnect());

const T = (iso: string) => new Date(iso);
const IN_WINDOW = T("2026-10-05T15:00:00Z"); // D-CONTRACT: janela do dia 1 ao 10
const PDF = new TextEncoder().encode("%PDF-1.4 nota");

async function userWith(role: "PAGAMENTO" | "GESTAO" | "SUPER_ADMIN", brandId: string | null) {
  const id = randomUUID();
  await prisma.user.create({ data: { id, email: `${id}@x.com`, name: role, roleGrants: { create: { role, brandId } } } });
  return (await loadActor(prisma, id))!;
}

/** Creator liberada, com R$ 800 disponíveis (setembro liberado) e um pedido de saque do total em análise. */
async function requested() {
  const a = await seedBrand(prisma);
  const userId = randomUUID();
  await prisma.user.create({ data: { id: userId, email: `${userId}@x.com`, name: "Creator" } });
  await prisma.creatorAccount.update({ where: { id: a.account.id }, data: { userId, pixKey: "pix@exemplo.com", cpf: "12345678900" } });
  await prisma.creator.update({ where: { id: a.creator.id }, data: { withdrawalsUnlockedAt: T("2026-10-01T00:00:00Z"), withdrawalsUnlockedById: "pagamento" } });
  await prisma.ledgerEntry.create({ data: commissionEntry({ brandId: a.brand.id, creatorId: a.creator.id, orderId: a.order.id }, { amountCents: 80_000, availableAt: T("2026-09-08T12:00:00Z") }) });
  await prisma.commissionRelease.create({ data: { brandId: a.brand.id, creatorId: a.creator.id, month: "2026-09", salesCents: 50_000, minCents: 50_000 } });
  const ctx = await portalContext(prisma, (await loadActor(prisma, userId))!, a.brand.slug);
  const { withdrawalId } = await requestWithdrawal(prisma, ctx, { actorUserId: userId, requestId: randomUUID(), amountCents: 80_000, pdf: PDF }, IN_WINDOW);
  const pagamento = await userWith("PAGAMENTO", a.brand.id);
  const gestao = await userWith("GESTAO", a.brand.id);
  return { ...a, ctx, userId, withdrawalId, pagamento, gestao };
}

/** Pedido já aprovado pela Gestão (M1.1), pronto para o Pagamento. */
async function approved() {
  const s = await requested();
  await approveWithdrawal(prisma, s.gestao, s.withdrawalId, IN_WINDOW);
  return s;
}

const sum = async (creatorId: string) => (await prisma.ledgerEntry.aggregate({ where: { creatorId }, _sum: { amountCents: true } }))._sum.amountCents;

describe("decisão do saque (banco real)", () => {
  it("fila mostra o pedido com Pix, documento e disponível; pagar lança o saque no extrato uma vez só", async () => {
    const s = await approved();
    const queue = await withdrawalQueue(prisma, s.pagamento, "APPROVED", IN_WINDOW);
    expect(queue.find((r) => r.id === s.withdrawalId)).toMatchObject({ amountCents: 80_000, pixKey: "pix@exemplo.com", document: "12345678900", hasNf: true, availableBeforeCents: 80_000 });
    expect(await nfLocation(prisma, s.pagamento, s.withdrawalId)).toMatchObject({ bucket: "nf" });

    const results = await Promise.allSettled([1, 2].map(() => payWithdrawal(prisma, s.pagamento, s.withdrawalId, IN_WINDOW)));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await sum(s.creator.id)).toBe(0);
    const w = await prisma.withdrawal.findUniqueOrThrow({ where: { id: s.withdrawalId }, include: { ledgerEntries: true } });
    expect(w).toMatchObject({ status: "PAID", decidedById: s.pagamento.userId });
    expect(w.ledgerEntries).toMatchObject([{ type: "WITHDRAWAL", amountCents: -80_000 }]);
    await expect(rejectWithdrawal(prisma, s.pagamento, s.withdrawalId, "tarde")).rejects.toThrow(/mudou de situação/);
    expect((await withdrawalQueue(prisma, s.pagamento, "DECIDED")).find((r) => r.id === s.withdrawalId)?.status).toBe("PAID");
    expect(await prisma.auditLog.count({ where: { action: "withdrawal.paid", entityId: s.withdrawalId } })).toBe(1);
  });

  it("recusar exige motivo, não mexe no extrato e libera novo pedido", async () => {
    const s = await requested();
    await expect(rejectWithdrawal(prisma, s.gestao, s.withdrawalId, "  ")).rejects.toThrow(/motivo/);
    await rejectWithdrawal(prisma, s.gestao, s.withdrawalId, " Valor da nota   diferente do pedido ");
    expect(await prisma.withdrawal.findUniqueOrThrow({ where: { id: s.withdrawalId } })).toMatchObject({ status: "REJECTED", note: "Valor da nota diferente do pedido" });
    expect(await prisma.notification.findFirstOrThrow({ where: { dedupeKey: `withdrawal:${s.withdrawalId}:rejected` } })).toMatchObject({
      kind: "WITHDRAWAL_REJECTED",
      body: expect.stringContaining("Motivo: Valor da nota diferente do pedido. O valor continua"),
    });
    expect(await sum(s.creator.id)).toBe(80_000);
    const again = await requestWithdrawal(prisma, s.ctx, { actorUserId: s.userId, requestId: randomUUID(), amountCents: 80_000, pdf: PDF }, IN_WINDOW);
    expect(again.created).toBe(true);
  });

  it("creator cancela o próprio pedido em análise; não cancela de outra nem na visualização da equipe", async () => {
    const s = await requested();
    const other = await requested();
    await expect(cancelMyWithdrawal(prisma, other.ctx, other.userId, s.withdrawalId)).rejects.toThrow(/não encontrado/);
    await expect(cancelMyWithdrawal(prisma, { ...s.ctx, viewAs: { userId: "sa" } }, s.userId, s.withdrawalId)).rejects.toThrow(/Visualização/);
    await cancelMyWithdrawal(prisma, s.ctx, s.userId, s.withdrawalId);
    expect(await prisma.withdrawal.findUniqueOrThrow({ where: { id: s.withdrawalId } })).toMatchObject({ status: "CANCELLED", decidedById: s.userId });
    await expect(payWithdrawal(prisma, s.pagamento, s.withdrawalId)).rejects.toThrow(/mudou de situação/);
    await expect(cancelMyWithdrawal(prisma, s.ctx, s.userId, s.withdrawalId)).rejects.toThrow(/mudou de situação/);
  });

  it("duas etapas: Gestão aprova, Pagamento paga; cada um só o seu passo; outra marca não vê", async () => {
    const s = await requested();
    const otherBrand = await seedBrand(prisma);
    const pagOutra = await userWith("PAGAMENTO", otherBrand.brand.id);
    // Em análise: o Pagamento não aprova nem paga; a Gestão vê a fila e aprova.
    await expect(approveWithdrawal(prisma, s.pagamento, s.withdrawalId)).rejects.toThrow(/permissão para aprovar/);
    await expect(rejectWithdrawal(prisma, s.pagamento, s.withdrawalId, "não")).rejects.toThrow(/permissão para aprovar/);
    await expect(payWithdrawal(prisma, s.pagamento, s.withdrawalId)).rejects.toThrow(/mudou de situação/);
    expect((await withdrawalQueue(prisma, s.gestao, "REQUESTED", IN_WINDOW)).find((r) => r.id === s.withdrawalId)).toMatchObject({ canApprove: true, canPay: false });
    expect((await withdrawalQueue(prisma, s.pagamento, "REQUESTED", IN_WINDOW)).find((r) => r.id === s.withdrawalId)).toMatchObject({ canApprove: false, canPay: false });
    expect((await staffHome(prisma, s.gestao)).withdrawals).toMatchObject({ mine: { approve: true, pay: false }, openingsPending: null });

    await approveWithdrawal(prisma, s.gestao, s.withdrawalId, IN_WINDOW);
    await expect(approveWithdrawal(prisma, s.gestao, s.withdrawalId)).rejects.toThrow(/mudou de situação/);
    expect(await prisma.withdrawal.findUniqueOrThrow({ where: { id: s.withdrawalId } })).toMatchObject({ status: "APPROVED", approvedById: s.gestao.userId, decidedAt: null });
    expect(await prisma.notification.count({ where: { dedupeKey: `withdrawal:${s.withdrawalId}:approved`, kind: "WITHDRAWAL_APPROVED" } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: "withdrawal.approved", entityId: s.withdrawalId } })).toBe(1);
    // Aprovado: a creator não cancela mais; o saldo continua reservado; a Gestão não paga nem recusa.
    await expect(cancelMyWithdrawal(prisma, s.ctx, s.userId, s.withdrawalId)).rejects.toThrow(/mudou de situação/);
    await expect(requestWithdrawal(prisma, s.ctx, { actorUserId: s.userId, requestId: randomUUID(), amountCents: 80_000, pdf: PDF }, IN_WINDOW)).rejects.toThrow();
    await expect(payWithdrawal(prisma, s.gestao, s.withdrawalId)).rejects.toThrow(/permissão para pagar/);
    await expect(rejectWithdrawal(prisma, s.gestao, s.withdrawalId, "não")).rejects.toThrow(/permissão para pagar/);
    await expect(payWithdrawal(prisma, pagOutra, s.withdrawalId)).rejects.toThrow(/permissão/);
    await expect(nfLocation(prisma, pagOutra, s.withdrawalId)).rejects.toThrow(/permissão/);
    expect((await withdrawalQueue(prisma, pagOutra, "APPROVED")).some((r) => r.id === s.withdrawalId)).toBe(false);
    expect((await withdrawalQueue(prisma, s.pagamento, "APPROVED", IN_WINDOW)).find((r) => r.id === s.withdrawalId)).toMatchObject({ canPay: true, availableBeforeCents: 80_000 });
    expect(await nfLocation(prisma, s.gestao, s.withdrawalId)).toMatchObject({ bucket: "nf" });

    const sa = await userWith("SUPER_ADMIN", null);
    await payWithdrawal(prisma, sa, s.withdrawalId);
    expect(await prisma.notification.count({ where: { dedupeKey: `withdrawal:${s.withdrawalId}:paid`, kind: "WITHDRAWAL_PAID" } })).toBe(1);
  });

  it("Pagamento recusa o aprovado com motivo (ex.: Pix com erro) e o valor volta para a creator", async () => {
    const s = await approved();
    await expect(rejectWithdrawal(prisma, s.pagamento, s.withdrawalId, " ")).rejects.toThrow(/motivo/);
    await rejectWithdrawal(prisma, s.pagamento, s.withdrawalId, "Chave Pix não existe");
    expect(await prisma.withdrawal.findUniqueOrThrow({ where: { id: s.withdrawalId } })).toMatchObject({ status: "REJECTED", decidedById: s.pagamento.userId, approvedById: s.gestao.userId });
    expect(await sum(s.creator.id)).toBe(80_000);
    const again = await requestWithdrawal(prisma, s.ctx, { actorUserId: s.userId, requestId: randomUUID(), amountCents: 80_000, pdf: PDF }, IN_WINDOW);
    expect(again.created).toBe(true);
  });

  it("resumo comissão a pagar: sacável, em análise, aprovados, a liberar e aguardando", async () => {
    const s = await requested();
    const g = (await payoutSummary(prisma, s.gestao, [s.brand.id], IN_WINDOW));
    expect(g).toMatchObject({ availableCents: 0, requested: { count: 1, cents: 80_000 }, approved: { count: 0, cents: 0 } });
    // Ajuste da equipe entra sacável na hora (não espera o fechamento do mês).
    await prisma.ledgerEntry.create({
      data: { brandId: s.brand.id, creatorId: s.creator.id, type: "ADJUSTMENT", amountCents: 1_500, availableAt: IN_WINDOW, idempotencyKey: randomUUID(), note: "ajuste", createdById: s.gestao.userId },
    });
    await approveWithdrawal(prisma, s.gestao, s.withdrawalId, IN_WINDOW);
    expect(await payoutSummary(prisma, s.pagamento, [s.brand.id], IN_WINDOW)).toMatchObject({ availableCents: 1_500, requested: { count: 0 }, approved: { count: 1, cents: 80_000 } });
    const otherBrand = await seedBrand(prisma);
    expect(await payoutSummary(prisma, await userWith("PAGAMENTO", otherBrand.brand.id), [s.brand.id], IN_WINDOW)).toMatchObject({ availableCents: 0, approved: { count: 0 } });
  });

  it("conferir de novo grava o selo; só com o pedido em aberto", async () => {
    const s = await requested();
    expect((await prisma.withdrawal.findUniqueOrThrow({ where: { id: s.withdrawalId } })).nfCheck).toBe("MANUAL");
    const r = await recheckWithdrawalNf(prisma, s.gestao, s.withdrawalId, PDF);
    expect(r).toEqual({ nfCheck: "MANUAL", problems: [] });
    expect(await prisma.auditLog.count({ where: { action: "withdrawal.nf_recheck", entityId: s.withdrawalId } })).toBe(1);
    const otherBrand = await seedBrand(prisma);
    await expect(recheckWithdrawalNf(prisma, await userWith("GESTAO", otherBrand.brand.id), s.withdrawalId, PDF)).rejects.toThrow(/permissão/);
    await rejectWithdrawal(prisma, s.gestao, s.withdrawalId, "nota errada");
    await expect(recheckWithdrawalNf(prisma, s.gestao, s.withdrawalId, PDF)).rejects.toThrow(/mudou de situação/);
  });

  it("travas do banco: recusa sem motivo, decisão sem autor, dois lançamentos do mesmo saque", async () => {
    const s = await requested();
    const now = new Date();
    await expectDbError(prisma.withdrawal.update({ where: { id: s.withdrawalId }, data: { status: "REJECTED", decidedAt: now, decidedById: "x", note: " " } }), /Withdrawal_rejected_has_note/);
    await expectDbError(prisma.withdrawal.update({ where: { id: s.withdrawalId }, data: { status: "CANCELLED", decidedAt: now } }), /Withdrawal_decided_has_author/);
    // M1.1: aprovado sem quem aprovou; aprovação pela metade; aprovado com decisão.
    await expectDbError(prisma.withdrawal.update({ where: { id: s.withdrawalId }, data: { status: "APPROVED" } }), /Withdrawal_approved_has_author/);
    await expectDbError(prisma.withdrawal.update({ where: { id: s.withdrawalId }, data: { approvedAt: now } }), /Withdrawal_approval_pair/);
    await expectDbError(
      prisma.withdrawal.update({ where: { id: s.withdrawalId }, data: { status: "APPROVED", approvedAt: now, approvedById: "g", decidedAt: now, decidedById: "g" } }),
      /Withdrawal_decided_consistent/,
    );
    await approveWithdrawal(prisma, s.gestao, s.withdrawalId, now);
    await payWithdrawal(prisma, s.pagamento, s.withdrawalId);
    await expectDbError(
      prisma.ledgerEntry.create({ data: { brandId: s.brand.id, creatorId: s.creator.id, type: "WITHDRAWAL", amountCents: -1, withdrawalId: s.withdrawalId, availableAt: now, idempotencyKey: randomUUID() } }),
      /LedgerEntry_one_payment_per_withdrawal/,
    );
  });
});
