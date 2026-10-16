import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { loadActor } from "@/lib/auth/actor";
import { updateContact } from "@/lib/creators/profile";
import { pushCentral } from "@/lib/sheets/central";
import { undoSheetChanges } from "@/lib/sheets/undo";
import { seedBrand, testClient } from "./fixtures";

const prisma = testClient();
afterAll(() => prisma.$disconnect());

describe("Desfazer o que a Central mandou (D-SHEETREADONLY, banco real)", () => {
  it("volta os campos da planilha ao valor da cópia; mantém o que a equipe mudou depois", async () => {
    const { brand, creator } = await seedBrand(prisma);
    const acc = await prisma.creatorAccount.findFirstOrThrow({ where: { creators: { some: { id: creator.id } } } });
    await prisma.creatorAccount.update({ where: { id: acc.id }, data: { cpf: "52998224725", pixKey: "antiga@pix", phone: "(31) 90000-0000", addrStreet: "Rua Antiga, 1", addrCity: "Betim", addrState: "MG" } });
    await prisma.creator.update({ where: { id: creator.id }, data: { notes: "nota da equipe", inGroup: false } });
    const before = await prisma.creator.findUniqueOrThrow({ where: { id: creator.id }, include: { account: true } });
    const since = new Date();

    const later = new Date(Date.now() + 60_000);
    const values = { "NOME COMPLETO": acc.name, CPF: "529.982.247-25", "CHAVE PIX": "nova@pix", WHATSAPP: "(31) 98888-8888", OBS: "3 vídeos", GRUPO: "Sim", ENDEREÇO: "Rua Nova, 2", "CIDADE/ES": "Contagem/MG" };
    await pushCentral(prisma, brand.slug, [{ tab: "CREATORS", row: 3, values, edited: Object.keys(values), editedAt: later.toISOString() }]);
    expect(await prisma.creatorAccount.findUniqueOrThrow({ where: { id: acc.id } })).toMatchObject({ pixKey: "nova@pix", addrCity: "Contagem" });

    // A equipe muda o telefone depois da planilha: esse fica.
    const gestao = randomUUID();
    await prisma.user.create({ data: { id: gestao, email: `${gestao}@x.com`, name: "G", roleGrants: { create: { role: "GESTAO", brandId: brand.id } } } });
    await updateContact(prisma, await loadActor(prisma, gestao), creator.id, { name: acc.name, email: acc.email, phone: "(11) 97777-7777" });

    const snapshot = [{ creatorId: creator.id, creator: { notes: before.notes, inGroup: before.inGroup }, account: { pixKey: "antiga@pix", phone: "(31) 90000-0000", addrStreet: "Rua Antiga, 1", addrNumber: null, addrComplement: null, addrDistrict: null, addrZip: null, addrCity: "Betim", addrState: "MG" } }];

    // Só conferência: conta e não muda nada.
    const dry = await undoSheetChanges(prisma, brand.slug, since, snapshot, false);
    expect(dry).toMatchObject({ creators: 1, fields: 5, keptNewer: 1, failed: 0 });
    expect((await prisma.creatorAccount.findUniqueOrThrow({ where: { id: acc.id } })).pixKey).toBe("nova@pix");

    const done = await undoSheetChanges(prisma, brand.slug, since, snapshot, true);
    expect(done).toMatchObject({ creators: 1, fields: 5, keptNewer: 1 });
    const after = await prisma.creator.findUniqueOrThrow({ where: { id: creator.id }, include: { account: true } });
    expect(after).toMatchObject({ notes: "nota da equipe", inGroup: false, account: { pixKey: "antiga@pix", phone: "(11) 97777-7777", addrStreet: "Rua Antiga, 1", addrCity: "Betim" } });
    expect(await prisma.auditLog.count({ where: { entityId: creator.id, action: "sheet.undo" } })).toBe(1);

    // Rodar de novo não volta nada (a última alteração agora é do sistema).
    expect(await undoSheetChanges(prisma, brand.slug, since, snapshot, true)).toMatchObject({ creators: 0, fields: 0, keptNewer: 6 });
  });
});
