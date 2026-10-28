import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { loadActor } from "@/lib/auth/actor";
import { portalContext } from "@/lib/portal/context";
import { approveWithdrawal, payWithdrawal } from "@/lib/withdrawals/decide";
import { generateRemessa, remessaPreview, removeFromRemessa } from "@/lib/withdrawals/remessa";
import { requestWithdrawal } from "@/lib/withdrawals/request";
import { commissionEntry, expectDbError, seedBrand, testClient } from "./fixtures";

const prisma = testClient();
afterAll(() => prisma.$disconnect());

const T = (iso: string) => new Date(iso);
const IN_WINDOW = T("2026-10-05T15:00:00Z");
const PDF = new TextEncoder().encode("%PDF-1.4 nota");

async function userWith(role: "PAGAMENTO" | "GESTAO", brandId: string) {
  const id = randomUUID();
  await prisma.user.create({ data: { id, email: `${id}@x.com`, name: role, roleGrants: { create: { role, brandId } } } });
  return (await loadActor(prisma, id))!;
}

/** Marca com conta no SICOOB e uma creator PJ com saque aprovado de R$ 800 (chave Pix e-mail). */
async function world() {
  const a = await seedBrand(prisma);
  await prisma.brand.update({
    where: { id: a.brand.id },
    data: { nfTakerDocument: "65100830000136", legalName: "Botanica Brasil Ltda", bankConvenio: "123456", bankAgency: "3069", bankAgencyDv: "0", bankAccount: "12345", bankAccountDv: "6" },
  });
  const userId = randomUUID();
  await prisma.user.create({ data: { id: userId, email: `${userId}@x.com`, name: "Creator" } });
  await prisma.creatorAccount.update({ where: { id: a.account.id }, data: { userId, pixKey: "Maria@Exemplo.com", cpf: "52998224725", cnpj: "11222333000181" } });
  await prisma.creator.update({ where: { id: a.creator.id }, data: { withdrawalsUnlockedAt: T("2026-10-01T00:00:00Z"), withdrawalsUnlockedById: "pagamento" } });
  await prisma.ledgerEntry.create({ data: commissionEntry({ brandId: a.brand.id, creatorId: a.creator.id, orderId: a.order.id }, { amountCents: 80_000, availableAt: T("2026-09-08T12:00:00Z") }) });
  await prisma.commissionRelease.create({ data: { brandId: a.brand.id, creatorId: a.creator.id, month: "2026-09", salesCents: 50_000, minCents: 50_000 } });
  const ctx = await portalContext(prisma, (await loadActor(prisma, userId))!, a.brand.slug);
  const { withdrawalId } = await requestWithdrawal(prisma, ctx, { actorUserId: userId, requestId: randomUUID(), amountCents: 80_000, pdf: PDF }, IN_WINDOW);
  const gestao = await userWith("GESTAO", a.brand.id);
  const pagamento = await userWith("PAGAMENTO", a.brand.id);
  await approveWithdrawal(prisma, gestao, withdrawalId, IN_WINDOW);
  return { ...a, withdrawalId, gestao, pagamento };
}

describe("remessa SICOOB (D-REMESSA, banco real)", () => {
  it("Pagamento gera o arquivo dos aprovados; saque fica enviado; número cresce; não repete; recusado volta", async () => {
    const s = await world();
    const now = T("2026-10-06T13:00:00Z");
    expect(await remessaPreview(prisma, s.pagamento, s.brand.id, "2026-10-06", now)).toMatchObject({ count: 1, totalCents: 80_000, problems: [] });
    await expect(generateRemessa(prisma, s.gestao, s.brand.id, "2026-10-06", now)).rejects.toThrow(/permissão/);

    const r = await generateRemessa(prisma, s.pagamento, s.brand.id, "2026-10-20", now);
    expect(r).toMatchObject({ nsa: 1, count: 1, totalCents: 80_000, fileName: expect.stringMatching(/^REMESSA_.+_000001\.txt$/) });
    const lines = r.content.slice(0, -2).split("\r\n");
    expect(lines).toHaveLength(6);
    expect(lines.every((l) => l.length === 240)).toBe(true);
    expect(lines[3]!.slice(127, 226).trimEnd()).toBe("maria@exemplo.com");
    expect(lines[3]!.slice(18, 32)).toBe("11222333000181"); // PJ recebe no CNPJ
    const w = await prisma.withdrawal.findUniqueOrThrow({ where: { id: s.withdrawalId }, select: { remittanceId: true, status: true } });
    expect(w.status).toBe("APPROVED");
    expect(await prisma.paymentRemittance.findUniqueOrThrow({ where: { id: w.remittanceId! } })).toMatchObject({ nsa: 1, count: 1, totalCents: 80_000 });

    // Já enviado: a próxima remessa não pega de novo.
    await expect(generateRemessa(prisma, s.pagamento, s.brand.id, "2026-10-20", now)).rejects.toThrow(/pendências/);
    // Banco recusou: sai da remessa e entra na próxima, com o número seguinte.
    await removeFromRemessa(prisma, s.pagamento, s.withdrawalId);
    expect((await generateRemessa(prisma, s.pagamento, s.brand.id, "2026-10-21", now)).nsa).toBe(2);
    // Pago: não sai mais da remessa.
    await payWithdrawal(prisma, s.pagamento, s.withdrawalId, now);
    await expect(removeFromRemessa(prisma, s.pagamento, s.withdrawalId)).rejects.toThrow(/aprovado/);
    expect(await prisma.auditLog.count({ where: { brandId: s.brand.id, action: "remittance.generated" } })).toBe(2);
  });

  it("sem conta da marca ou com chave Pix ruim, mostra o que falta e não gera; trava do banco", async () => {
    const s = await world();
    await prisma.brand.update({ where: { id: s.brand.id }, data: { bankConvenio: null } });
    await prisma.creatorAccount.update({ where: { id: s.account.id }, data: { pixKey: "xyz" } });
    const p = await remessaPreview(prisma, s.pagamento, s.brand.id, "2026-10-06", T("2026-10-06T13:00:00Z"));
    expect(p.problems.map((x) => x.problem).join(" ")).toMatch(/convênio.*Chave Pix|Chave Pix.*convênio/);
    await expect(generateRemessa(prisma, s.pagamento, s.brand.id, "2026-10-06", T("2026-10-06T13:00:00Z"))).rejects.toThrow(/pendências/);
    expect(await prisma.paymentRemittance.count({ where: { brandId: s.brand.id } })).toBe(0);
    await expectDbError(
      prisma.paymentRemittance.create({ data: { brandId: s.brand.id, nsa: 0, payDay: T("2026-10-06T00:00:00Z"), count: 1, totalCents: 1, sha256: "x", createdById: "x" } }),
      /PaymentRemittance_values/,
    );
  });
});
