import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { loadActor } from "@/lib/auth/actor";
import { portalContext } from "@/lib/portal/context";
import { setMyMotherName } from "@/lib/portal/social";
import { aleloCardSheet, aleloCardStatus, splitPhone } from "@/lib/withdrawals/alelo";
import { seedBrand, testClient } from "./fixtures";

const prisma = testClient();
afterAll(() => prisma.$disconnect());

async function staff(role: "GESTAO" | "PAGAMENTO", brandId: string) {
  const id = randomUUID();
  await prisma.user.create({ data: { id, email: `${id}@x.com`, name: role, roleGrants: { create: { role, brandId } } } });
  return (await loadActor(prisma, id))!;
}

describe("cartão Alelo de quem recebe como pessoa física (D-ALELOCARD, banco real)", () => {
  it("a creator informa o nome da mãe no portal; o Pagamento baixa a planilha com quem está pronta e ela fica marcada", async () => {
    const s = await seedBrand(prisma);
    await prisma.creator.update({ where: { id: s.creator.id }, data: { receivesAsIndividual: true } });
    await prisma.creatorAccount.update({ where: { id: s.account.id }, data: { cpf: "52998224725", birthDate: new Date("1990-05-10T00:00:00Z"), phone: "(31) 99123-4567" } });
    // Empresa (CNPJ) não entra.
    const pjAcc = await prisma.creatorAccount.create({ data: { name: "Empresa", email: `${randomUUID()}@x.com`, cpf: "11144477735", cnpj: "11222333000181" } });
    await prisma.creator.create({ data: { brandId: s.brand.id, accountId: pjAcc.id, categories: ["INFLUENCER"], receivesAsIndividual: false } });

    const pagamento = await staff("PAGAMENTO", s.brand.id);
    await expect(aleloCardStatus(prisma, await staff("GESTAO", s.brand.id), s.brand.id)).rejects.toThrow(/permissão/);
    let st = await aleloCardStatus(prisma, pagamento, s.brand.id);
    expect(st.ready).toHaveLength(0);
    expect(st.incomplete).toEqual([{ id: s.creator.id, name: s.account.name, missing: ["nome da mãe"] }]);
    await expect(aleloCardSheet(prisma, pagamento, s.brand.id)).rejects.toThrow(/Ninguém/);

    // Portal: ela informa o nome da mãe (uma vez).
    const uid = randomUUID();
    await prisma.user.create({ data: { id: uid, email: `${uid}@x.com`, name: "Creator" } });
    await prisma.creatorAccount.update({ where: { id: s.account.id }, data: { userId: uid } });
    const ctx = await portalContext(prisma, (await loadActor(prisma, uid))!, s.brand.slug);
    await expect(setMyMotherName(prisma, ctx, uid, "Joana")).rejects.toThrow(/nome e sobrenome/);
    await setMyMotherName(prisma, ctx, uid, "  Joana   Exemplo ");
    await expect(setMyMotherName(prisma, ctx, uid, "Outra Pessoa")).rejects.toThrow(/já foi informado/);
    expect((await prisma.creatorAccount.findUniqueOrThrow({ where: { id: s.account.id } })).motherName).toBe("Joana Exemplo");

    st = await aleloCardStatus(prisma, pagamento, s.brand.id);
    expect(st.ready.map((c) => c.id)).toEqual([s.creator.id]);
    const now = new Date("2026-11-06T15:00:00Z");
    const r = await aleloCardSheet(prisma, pagamento, s.brand.id, now);
    expect(r.count).toBe(1);
    expect(r.file.subarray(0, 2).toString("latin1")).toBe("PK"); // .xlsx é um ZIP
    expect(r.file.toString("latin1")).toContain("Joana Exemplo");
    expect((await prisma.creator.findUniqueOrThrow({ where: { id: s.creator.id } })).aleloCardRequestedAt).toEqual(now);
    expect((await aleloCardStatus(prisma, pagamento, s.brand.id)).ready).toHaveLength(0); // não repete
    expect(await prisma.auditLog.count({ where: { brandId: s.brand.id, action: "alelo.card_sheet" } })).toBe(1);
  });

  it("celular vira DDD e número, sem o +55", () => {
    expect(splitPhone("(31) 99123-4567")).toEqual(["31", "991234567"]);
    expect(splitPhone("5531991234567")).toEqual(["31", "991234567"]);
    expect(splitPhone("123")).toBeNull();
  });
});
