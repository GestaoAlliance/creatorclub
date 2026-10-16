import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { loadActor } from "@/lib/auth/actor";
import { updateContact } from "@/lib/creators/profile";
import { readCentral } from "@/lib/sheets/central";
import { seedBrand, testClient } from "./fixtures";

const prisma = testClient();
afterAll(() => prisma.$disconnect());

describe("Central só leitura (D-SHEETREADONLY, banco real)", () => {
  it("primeira leitura não muda nada; depois só a célula que mudou entra, se for mais nova que o sistema", async () => {
    const { brand, creator } = await seedBrand(prisma);
    const acc = await prisma.creatorAccount.findFirstOrThrow({ where: { creators: { some: { id: creator.id } } } });
    await prisma.creatorAccount.update({ where: { id: acc.id }, data: { cpf: "52998224725", pixKey: "sistema@pix", phone: "(31) 90000-0000" } });
    await prisma.creator.update({ where: { id: creator.id }, data: { contractSigned: true, notes: "nota" } });
    const base = { "NOME COMPLETO": acc.name, CPF: "529.982.247-25", "CHAVE PIX": "planilha@pix", WHATSAPP: "(31) 98888-8888", "CONTRATO ASS.": "Sim", OBS: "outra" };
    const read = (values: Record<string, unknown>, at: Date) => readCentral(prisma, brand.slug, [{ tab: "CREATORS", row: 3, values }], at);

    // Primeira leitura: só o ponto de partida.
    expect(await read(base, new Date(Date.now() + 1000))).toMatchObject({ baseline: true, matched: 1, applied: 0 });
    let a = await prisma.creatorAccount.findUniqueOrThrow({ where: { id: acc.id } });
    expect(a).toMatchObject({ pixKey: "sistema@pix", phone: "(31) 90000-0000" });

    // Mudou só o Pix na planilha: entra o Pix; o resto (diferente, mas igual à leitura anterior) não.
    expect(await read({ ...base, "CHAVE PIX": "nova@pix" }, new Date(Date.now() + 2000))).toMatchObject({ baseline: false, applied: 1 });
    a = await prisma.creatorAccount.findUniqueOrThrow({ where: { id: acc.id } });
    expect(a).toMatchObject({ pixKey: "nova@pix", phone: "(31) 90000-0000" });
    expect(await prisma.creator.findUniqueOrThrow({ where: { id: creator.id } })).toMatchObject({ notes: "nota" });

    // A equipe muda o telefone no sistema; a planilha sem mudança não desfaz.
    const gestao = randomUUID();
    await prisma.user.create({ data: { id: gestao, email: `${gestao}@x.com`, name: "G", roleGrants: { create: { role: "GESTAO", brandId: brand.id } } } });
    await updateContact(prisma, await loadActor(prisma, gestao), creator.id, { name: acc.name, email: acc.email, phone: "(11) 97777-7777" });
    expect(await read({ ...base, "CHAVE PIX": "nova@pix" }, new Date(Date.now() + 3000))).toMatchObject({ applied: 0 });
    expect((await prisma.creatorAccount.findUniqueOrThrow({ where: { id: acc.id } })).phone).toBe("(11) 97777-7777");

    // Texto fora de Sim/Não no checklist é ignorado (não apaga).
    expect(await read({ ...base, "CHAVE PIX": "nova@pix", "CONTRATO ASS.": "Vídeo entregue" }, new Date(Date.now() + 4000))).toMatchObject({ applied: 0 });
    expect((await prisma.creator.findUniqueOrThrow({ where: { id: creator.id } })).contractSigned).toBe(true);

    // Linha sem creator no sistema: aviso, nenhuma creator nova.
    const before = await prisma.creator.count({ where: { brandId: brand.id } });
    expect(await readCentral(prisma, brand.slug, [{ tab: "UGC", row: 9, values: { "NOME COMPLETO": "Pessoa Nova", "E-MAIL": `${randomUUID()}@x.com` } }])).toMatchObject({ unmatched: 1 });
    expect(await prisma.creator.count({ where: { brandId: brand.id } })).toBe(before);
    expect(await prisma.sheetSyncIssue.count({ where: { brandId: brand.id, message: { contains: "Pessoa Nova" } } })).toBe(1);
  });
});
