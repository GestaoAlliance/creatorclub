import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { loadActor } from "@/lib/auth/actor";
import { portalContext } from "@/lib/portal/context";
import { requestWithdrawal } from "@/lib/withdrawals/request";
import { danfseLines, makePdf } from "../nf-pdf";
import { commissionEntry, expectDbError, seedBrand, testClient } from "./fixtures";

const prisma = testClient();
afterAll(() => prisma.$disconnect());

const T = (iso: string) => new Date(iso);
const IN_WINDOW = T("2026-10-05T15:00:00Z");
const TAKER = "65.100.830/0001-36";
const ISSUER = "11222333000181";
/** Chave de 50 dígitos: município (7), ambiente (1), tipo (1), CNPJ do emissor (14), número (13), AAMM (4), código (9), DV (1). */
const keyFor = (n: number) => `310620022${ISSUER}${String(n).padStart(13, "0")}26080590551396`;

async function creatorWith(availableCents: number, cnpj: string | null = null) {
  const a = await seedBrand(prisma);
  await prisma.brand.update({ where: { id: a.brand.id }, data: { nfTakerDocument: TAKER } });
  const userId = randomUUID();
  await prisma.user.create({ data: { id: userId, email: `${userId}@x.com`, name: "Creator" } });
  await prisma.creatorAccount.update({ where: { id: a.account.id }, data: { userId, pixKey: "pix@exemplo.com", cnpj } });
  await prisma.creator.update({ where: { id: a.creator.id }, data: { withdrawalsUnlockedAt: T("2026-10-01T00:00:00Z"), withdrawalsUnlockedById: "pagamento" } });
  await prisma.ledgerEntry.create({ data: commissionEntry({ brandId: a.brand.id, creatorId: a.creator.id, orderId: a.order.id }, { amountCents: availableCents, availableAt: T("2026-09-08T12:00:00Z") }) });
  await prisma.commissionRelease.create({ data: { brandId: a.brand.id, creatorId: a.creator.id, month: "2026-09", salesCents: 50_000, minCents: 50_000 } });
  const ctx = await portalContext(prisma, (await loadActor(prisma, userId))!, a.brand.slug);
  return { ...a, ctx, userId };
}

const nf = (o: { key: string; taker?: string; issuer?: string; amount?: string; code?: string }) =>
  makePdf(danfseLines({ key: o.key, issuer: o.issuer ?? "11.222.333/0001-81", taker: o.taker ?? TAKER, amount: o.amount ?? "R$ 800,00", code: o.code }));

describe("conferência da NF no pedido de saque (D-NFCHECK, banco real)", () => {
  it("nota certa: pedido conferido, chave gravada e CNPJ da nota vai para a ficha sem CNPJ", async () => {
    const c = await creatorWith(80_000);
    const key = keyFor(1);
    const r = await requestWithdrawal(prisma, c.ctx, { actorUserId: c.userId, requestId: randomUUID(), amountCents: 80_000, pdf: nf({ key }) }, IN_WINDOW);
    expect(await prisma.withdrawal.findUniqueOrThrow({ where: { id: r.withdrawalId } })).toMatchObject({ nfCheck: "OK", nfAccessKey: key });
    expect((await prisma.creatorAccount.findUniqueOrThrow({ where: { id: c.account.id } })).cnpj).toBe(ISSUER);
  });

  it("tomadora, valor, emissor ou código diferente bloqueia com o motivo; nada é gravado", async () => {
    const c = await creatorWith(80_000, ISSUER);
    const ask = (pdf: Uint8Array) => requestWithdrawal(prisma, c.ctx, { actorUserId: c.userId, requestId: randomUUID(), amountCents: 80_000, pdf }, IN_WINDOW);
    await expect(ask(nf({ key: keyFor(2), taker: "12.345.678/0001-95" }))).rejects.toThrow(/tomadora da nota precisa ser/);
    await expect(ask(nf({ key: keyFor(2), amount: "R$ 799,99" }))).rejects.toThrow(/O valor da nota é R\$\s799,99; o saque é de R\$\s800,00/);
    await expect(ask(nf({ key: keyFor(2), issuer: "99.888.777/0001-66" }))).rejects.toThrow(/CNPJ diferente/);
    await expect(ask(nf({ key: keyFor(2), code: "01.07.00 / 001" }))).rejects.toThrow(/17\.06/);
    expect(await prisma.withdrawal.count({ where: { creatorId: c.creator.id } })).toBe(0);
  });

  it("nota que o sistema não lê entra marcada para conferir", async () => {
    const c = await creatorWith(80_000);
    const r = await requestWithdrawal(
      prisma, c.ctx, { actorUserId: c.userId, requestId: randomUUID(), amountCents: 80_000, pdf: new TextEncoder().encode("%PDF-1.4 escaneada") }, IN_WINDOW,
    );
    expect(await prisma.withdrawal.findUniqueOrThrow({ where: { id: r.withdrawalId } })).toMatchObject({ nfCheck: "MANUAL", nfAccessKey: null });
  });

  it("a mesma nota não vale para dois saques; recusado libera a nota", async () => {
    const key = keyFor(3);
    const a = await creatorWith(80_000);
    const first = await requestWithdrawal(prisma, a.ctx, { actorUserId: a.userId, requestId: randomUUID(), amountCents: 80_000, pdf: nf({ key }) }, IN_WINDOW);
    const b = await creatorWith(80_000);
    const again = () => requestWithdrawal(prisma, b.ctx, { actorUserId: b.userId, requestId: randomUUID(), amountCents: 80_000, pdf: nf({ key }) }, IN_WINDOW);
    await expect(again()).rejects.toThrow(/já foi usada/);
    await prisma.withdrawal.update({ where: { id: first.withdrawalId }, data: { status: "REJECTED", decidedAt: IN_WINDOW, decidedById: "pagamento", note: "teste" } });
    expect((await again()).created).toBe(true);
  });

  it("travas do banco", async () => {
    const c = await creatorWith(80_000);
    const base = { brandId: c.brand.id, creatorId: c.creator.id, amountCents: 1_000 };
    await expectDbError(prisma.withdrawal.create({ data: { ...base, idempotencyKey: randomUUID(), nfAccessKey: "123" } }), /Withdrawal_nf_access_key_format/);
    const key = keyFor(4);
    await prisma.withdrawal.create({ data: { ...base, idempotencyKey: randomUUID(), nfAccessKey: key, status: "PAID", decidedAt: IN_WINDOW, decidedById: "p" } });
    await expectDbError(prisma.withdrawal.create({ data: { ...base, idempotencyKey: randomUUID(), nfAccessKey: key, status: "PAID", decidedAt: IN_WINDOW, decidedById: "p" } }), /Withdrawal_nf_access_key_once/);
  });
});
