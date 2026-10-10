import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { loadActor } from "@/lib/auth/actor";
import { updateChecklist } from "@/lib/creators/contract";
import { portalContext } from "@/lib/portal/context";
import { portalWithdrawalTab } from "@/lib/portal/withdrawals";
import { receiptFor, withdrawalQueue } from "@/lib/withdrawals/decide";
import { requestWithdrawal, requestWithdrawalWithReceipt } from "@/lib/withdrawals/request";
import { commissionEntry, expectDbError, seedBrand, testClient } from "./fixtures";

const prisma = testClient();
afterAll(() => prisma.$disconnect());

const T = (iso: string) => new Date(iso);
const IN_WINDOW = T("2026-11-03T15:00:00Z");
const CPF = "52998224725";

async function userWith(role: "GESTAO" | "PAGAMENTO", brandId: string) {
  const id = randomUUID();
  await prisma.user.create({ data: { id, email: `${id}@x.com`, name: role, roleGrants: { create: { role, brandId } } } });
  return (await loadActor(prisma, id))!;
}

async function setup(cpf: string | null = null) {
  const a = await seedBrand(prisma);
  await prisma.brand.update({ where: { id: a.brand.id }, data: { nfTakerDocument: "65.100.830/0001-36", legalName: "MARCA EXEMPLO LTDA" } });
  const userId = randomUUID();
  await prisma.user.create({ data: { id: userId, email: `${userId}@x.com`, name: "Creator" } });
  await prisma.creatorAccount.update({ where: { id: a.account.id }, data: { userId, pixKey: "pix@exemplo.com", cpf } });
  await prisma.creator.update({ where: { id: a.creator.id }, data: { withdrawalsUnlockedAt: T("2026-10-01T00:00:00Z"), withdrawalsUnlockedById: "pagamento" } });
  await prisma.ledgerEntry.create({ data: commissionEntry({ brandId: a.brand.id, creatorId: a.creator.id, orderId: a.order.id }, { amountCents: 80_000, availableAt: T("2026-10-08T12:00:00Z") }) });
  await prisma.commissionRelease.create({ data: { brandId: a.brand.id, creatorId: a.creator.id, month: "2026-10", salesCents: 100_000, minCents: 100_000 } });
  const ctx = await portalContext(prisma, (await loadActor(prisma, userId))!, a.brand.slug);
  return { ...a, ctx, userId };
}

const ask = (c: Awaited<ReturnType<typeof setup>>, extra: Partial<Parameters<typeof requestWithdrawalWithReceipt>[2]> = {}) =>
  requestWithdrawalWithReceipt(
    prisma,
    c.ctx,
    { actorUserId: c.userId, requestId: randomUUID(), amountCents: 80_000, fullName: "Maria Exemplo da Silva", cpf: "529.982.247-25", accept: true, ip: "1.2.3.4", ...extra },
    IN_WINDOW,
  );

describe("saque de pessoa física com recibo (D-PFRECEIPT, banco real)", () => {
  it("equipe marca na ficha; creator aceita o recibo; Pagamento vê o recibo; CPF vai para a ficha", async () => {
    const c = await setup();
    await expect(ask(c)).rejects.toThrow(/só para quem a equipe cadastrou como pessoa física/);
    const gestao = await userWith("GESTAO", c.brand.id);
    await updateChecklist(prisma, gestao, c.creator.id, { start: null, end: null, contractSigned: null, couponRegistered: null, followsOnInstagram: null, inGroup: null, tagged: null, note: null, receivesAsIndividual: true });
    expect((await portalWithdrawalTab(prisma, c.ctx, { now: IN_WINDOW })).individual).toBe(true);

    // pessoa física não pede com nota
    await expect(requestWithdrawal(prisma, c.ctx, { actorUserId: c.userId, requestId: randomUUID(), amountCents: 80_000, pdf: new TextEncoder().encode("%PDF-1.4") }, IN_WINDOW)).rejects.toThrow(/pessoa física/);
    await expect(ask(c, { fullName: "Maria" })).rejects.toThrow(/nome completo/);
    await expect(ask(c, { cpf: "111.111.111-11" })).rejects.toThrow(/CPF inválido/);
    await expect(ask(c, { accept: false })).rejects.toThrow(/aceita o recibo/);

    const r = await ask(c);
    const w = await prisma.withdrawal.findUniqueOrThrow({ where: { id: r.withdrawalId }, include: { receipt: true } });
    expect(w).toMatchObject({ method: "RECEIPT_PIX", nfFileId: null, nfCheck: null, receipt: { fullName: "Maria Exemplo da Silva", cpf: CPF, ip: "1.2.3.4" } });
    expect(w.receipt!.body).toContain("Eu, Maria Exemplo da Silva, CPF 529.982.247-25, declaro que recebo de MARCA EXEMPLO LTDA (CNPJ 65.100.830/0001-36)");
    expect(w.receipt!.body).toMatch(/R\$\s800,00 \(oitocentos reais\).*liberadas até outubro de 2026/);
    expect((await prisma.creatorAccount.findUniqueOrThrow({ where: { id: c.account.id } })).cpf).toBe(CPF);

    const pagamento = await userWith("PAGAMENTO", c.brand.id);
    const [row] = (await withdrawalQueue(prisma, pagamento, "REQUESTED")).filter((x) => x.id === r.withdrawalId);
    expect(row).toMatchObject({ individual: true, hasNf: false });
    expect((await receiptFor(prisma, pagamento, r.withdrawalId)).body).toContain("Maria Exemplo da Silva");
    await expect(receiptFor(prisma, gestao, r.withdrawalId)).rejects.toThrow(/Sem permissão/);
  });

  it("CPF diferente do cadastro é recusado", async () => {
    const c = await setup("11144477735");
    await prisma.creator.update({ where: { id: c.creator.id }, data: { receivesAsIndividual: true } });
    await expect(ask(c)).rejects.toThrow(/não confere com o seu cadastro/);
  });

  it("travas do banco: recibo só recebe inserções; CPF com 11 números", async () => {
    const c = await setup();
    await prisma.creator.update({ where: { id: c.creator.id }, data: { receivesAsIndividual: true } });
    const r = await ask(c);
    const rec = await prisma.withdrawalReceipt.findUniqueOrThrow({ where: { withdrawalId: r.withdrawalId } });
    await expectDbError(prisma.withdrawalReceipt.update({ where: { id: rec.id }, data: { fullName: "Outra" } }), /WithdrawalReceipt é somente inserção/);
    const w2 = await prisma.withdrawal.create({ data: { brandId: c.brand.id, creatorId: c.creator.id, amountCents: 1, idempotencyKey: randomUUID(), status: "CANCELLED", decidedAt: IN_WINDOW, decidedById: "x" } });
    await expectDbError(
      prisma.withdrawalReceipt.create({ data: { brandId: c.brand.id, withdrawalId: w2.id, userId: c.userId, fullName: "X Y", cpf: "123", body: "x" } }),
      /WithdrawalReceipt_values/,
    );
  });
});
