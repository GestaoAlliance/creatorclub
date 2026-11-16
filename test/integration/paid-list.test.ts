import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { loadActor } from "@/lib/auth/actor";
import { paidCsv, paidList } from "@/lib/withdrawals/paid";
import { expectDbError, seedBrand, testClient } from "./fixtures";

const prisma = testClient();
afterAll(() => prisma.$disconnect());

async function staff(role: "GESTAO" | "PAGAMENTO" | "ENVIO", brandId: string, name: string = role) {
  const id = randomUUID();
  await prisma.user.create({ data: { id, email: `${id}@x.com`, name, roleGrants: { create: { role, brandId } } } });
  return (await loadActor(prisma, id))!;
}

describe("Pagos por mês (D-PAIDLIST, banco real)", () => {
  it("lista o pago no mês do pagamento, separa CNPJ e CPF e junta os pagamentos de antes do sistema", async () => {
    const { brand, creator, account } = await seedBrand(prisma);
    await prisma.creatorAccount.update({ where: { id: account.id }, data: { cnpj: "12345678000199", cpf: "12345678901" } });
    const pfAcc = await prisma.creatorAccount.create({ data: { name: "Bia Física", email: `${randomUUID()}@x.com`, cpf: "98765432100" } });
    const pf = await prisma.creator.create({ data: { brandId: brand.id, accountId: pfAcc.id, categories: ["INFLUENCER"], receivesAsIndividual: true } });
    const pag = await staff("PAGAMENTO", brand.id, "Guilherme");
    const base = { brandId: brand.id, status: "PAID" as const, decidedById: pag.userId };
    // 30/11 23h em São Paulo = 01/12 em UTC: conta em novembro.
    await prisma.withdrawal.create({ data: { ...base, creatorId: creator.id, amountCents: 10_000, idempotencyKey: randomUUID(), requestedAt: new Date("2026-11-20T12:00:00Z"), decidedAt: new Date("2026-12-01T02:00:00Z"), pixReference: "E123" } });
    await prisma.withdrawal.create({ data: { ...base, creatorId: pf.id, method: "RECEIPT_PIX", amountCents: 5_000, idempotencyKey: randomUUID(), decidedAt: new Date("2026-11-10T15:00:00Z") } });
    await prisma.withdrawal.create({ data: { ...base, creatorId: creator.id, amountCents: 7_000, idempotencyKey: randomUUID(), decidedAt: new Date("2026-12-05T15:00:00Z") } });
    await prisma.withdrawal.create({ data: { brandId: brand.id, creatorId: creator.id, amountCents: 1_000, idempotencyKey: randomUUID() } }); // em análise: fora
    await prisma.legacyPayout.create({ data: { brandId: brand.id, creatorId: creator.id, amountCents: 52_809, paidOn: new Date("2026-09-09"), note: "Pix SICOOB 09/09", createdById: pag.userId } });

    const now = new Date("2026-12-10T12:00:00Z");
    const nov = await paidList(prisma, pag, brand.id, "2026-11", now);
    expect(nov.totals).toMatchObject({ all: { count: 2, cents: 15_000 }, cnpj: { count: 1, cents: 10_000 }, cpf: { count: 1, cents: 5_000 } });
    expect(nov.rows[0]).toMatchObject({ kind: "CNPJ", paidDay: "2026-11-30", paidBy: "Guilherme", pixReference: "E123", document: "12345678000199" });
    expect(nov.months).toEqual(["2026-12", "2026-11", "2026-09"]);
    const set = await paidList(prisma, pag, brand.id, "2026-09", now);
    expect(set.rows).toEqual([expect.objectContaining({ legacy: true, paidDay: "2026-09-09", amountCents: 52_809, note: "Pix SICOOB 09/09" })]);
    expect((await paidList(prisma, pag, brand.id, "lixo", now)).month).toBe("2026-12");

    // Envio não vê saques; quem vê sem dado fiscal não vê CPF/CNPJ.
    await expect(paidList(prisma, await staff("ENVIO", brand.id), brand.id, "2026-11", now)).rejects.toThrow(/Sem permissão/);
    const csv = paidCsv(nov.rows, "Botanika");
    expect(csv).toContain("Botanika;Creator");
    expect(csv).toMatch(/Total;2 pagamentos;;;150,00/);

    await expectDbError(prisma.legacyPayout.create({ data: { brandId: brand.id, creatorId: creator.id, amountCents: 0, paidOn: new Date("2026-09-09"), note: "zero", createdById: "x" } }), /LegacyPayout_valid/);
    const l = await prisma.legacyPayout.findFirstOrThrow({ where: { creatorId: creator.id } });
    await expectDbError(prisma.legacyPayout.update({ where: { id: l.id }, data: { amountCents: 1 } }), /LegacyPayout é somente inserção/);
  });
});
