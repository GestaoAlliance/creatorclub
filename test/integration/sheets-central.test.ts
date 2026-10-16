import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { loadActor } from "@/lib/auth/actor";
import { updateContact } from "@/lib/creators/profile";
import { pullCentral, pushCentral } from "@/lib/sheets/central";
import { seedBrand, testClient } from "./fixtures";

const prisma = testClient();
afterAll(() => prisma.$disconnect());

const row = (tab: string, rowNo: number, values: Record<string, unknown>, edited: string[], editedAt: Date) => ({ tab, row: rowNo, values, edited, editedAt: editedAt.toISOString() });

describe("Central sincronizada com o sistema (D-SHEETSYNC, banco real)", () => {
  it("vale a alteração mais recente por campo; dinheiro vira aviso; volta com os dados do sistema", async () => {
    const { brand, creator } = await seedBrand(prisma);
    const acc = await prisma.creatorAccount.findFirstOrThrow({ where: { creators: { some: { id: creator.id } } } });
    await prisma.creatorAccount.update({ where: { id: acc.id }, data: { cpf: "52998224725" } });
    const later = new Date(Date.now() + 60_000);

    // Linha ligada pelo CPF; só a coluna editada (WHATSAPP) conta.
    const base = { "NOME COMPLETO": acc.name, CPF: "529.982.247-25", WHATSAPP: "(31) 99999-0000", "CHAVE PIX": "outra@pix", CUPOM: "OUTRO" };
    const [r1] = await pushCentral(prisma, brand.slug, [row("CREATORS", 3, base, ["WHATSAPP"], later)]);
    expect(r1).toMatchObject({ id: creator.id, applied: ["phone"] });
    let a = await prisma.creatorAccount.findUniqueOrThrow({ where: { id: acc.id } });
    expect(a).toMatchObject({ phone: "(31) 99999-0000", pixKey: null });
    expect(await prisma.fieldStamp.findUnique({ where: { entity_entityId_field: { entity: "CreatorAccount", entityId: acc.id, field: "phone" } } })).toMatchObject({
      source: "SHEET",
      changedAt: later,
    });

    // O sistema muda o telefone depois; uma edição mais antiga da planilha não desfaz.
    const gestao = randomUUID();
    await prisma.user.create({ data: { id: gestao, email: `${gestao}@x.com`, name: "G", roleGrants: { create: { role: "GESTAO", brandId: brand.id } } } });
    await updateContact(prisma, await loadActor(prisma, gestao), creator.id, { name: acc.name, email: acc.email, phone: "(11) 98888-7777" });
    const stamp = await prisma.fieldStamp.findUniqueOrThrow({ where: { entity_entityId_field: { entity: "CreatorAccount", entityId: acc.id, field: "phone" } } });
    expect(stamp.source).toBe("SYSTEM");
    const [r2] = await pushCentral(prisma, brand.slug, [row("CREATORS", 3, { ...base, "ID CREATOR CLUB": creator.id }, ["WHATSAPP", "CHAVE PIX"], new Date(stamp.changedAt.getTime() - 1000))]);
    expect(r2!.applied).toEqual([]);
    a = await prisma.creatorAccount.findUniqueOrThrow({ where: { id: acc.id } });
    expect(a.phone).toBe("(11) 98888-7777");

    // Mais nova: aplica; checklist e datas também.
    const newest = new Date(Date.now() + 120_000);
    const [r3] = await pushCentral(prisma, brand.slug, [
      row("CREATORS", 3, { ...base, "ID CREATOR CLUB": creator.id, GRUPO: "Sim", "DATA DE INÍCIO": "2026-10-05", "CIDADE/ES": "Betim/MG" }, ["CHAVE PIX", "GRUPO", "DATA DE INÍCIO", "CIDADE/ES"], newest),
    ]);
    expect(r3!.applied.sort()).toEqual(["cityState", "contractStart", "inGroup", "pixKey"]);
    const c = await prisma.creator.findUniqueOrThrow({ where: { id: creator.id }, include: { account: true } });
    expect(c).toMatchObject({ inGroup: true, contractStart: new Date("2026-10-05T00:00:00Z"), account: { pixKey: "outra@pix", addrCity: "Betim", addrState: "MG" } });

    // Cupom diferente: nada muda no dinheiro, só o aviso. CPF inválido: aviso.
    await pushCentral(prisma, brand.slug, [row("CREATORS", 3, { ...base, "ID CREATOR CLUB": creator.id, CPF: "123" }, ["CUPOM", "CPF"], newest)]);
    const issues = await prisma.sheetSyncIssue.findMany({ where: { brandId: brand.id }, select: { message: true } });
    expect(issues.map((i) => i.message)).toEqual(expect.arrayContaining([expect.stringMatching(/Cupom OUTRO na planilha.*confirme a dona em Cupons/), expect.stringMatching(/CPF "123" inválido/)]));
    expect(await prisma.couponAssignment.count({ where: { creatorId: creator.id, coupon: { code: "OUTRO" } } })).toBe(0);

    // Linha nova: vira creator na aba (tipo pela aba), com aviso do cupom.
    const [r4] = await pushCentral(prisma, brand.slug, [row("PRESCRITORES", 9, { "NOME COMPLETO": "Dra. Nova", "E-MAIL": `${randomUUID()}@x.com`, CUPOM: "DRANOVA" }, [], newest)]);
    const novo = await prisma.creator.findUniqueOrThrow({ where: { id: r4!.id! } });
    expect(novo).toMatchObject({ brandId: brand.id, categories: ["PRESCRITOR"], status: "ACTIVE", source: "central" });

    // Volta: tudo sem data; com data, só o que mudou depois.
    const all = await pullCentral(prisma, brand.slug, null);
    const mine = all.rows.find((r) => r.id === creator.id)!;
    expect(mine).toMatchObject({ tab: "CREATORS", append: true });
    expect(mine.values).toMatchObject({ "ID CREATOR CLUB": creator.id, WHATSAPP: "(11) 98888-7777", CPF: "529.982.247-25", GRUPO: "Sim", "DATA DE INÍCIO": "05/10/2026", "CIDADE/ES": "Betim/MG", "ÚLTIMO PEDIDO": "Sem pedido" });
    expect(all.rows.find((r) => r.id === novo.id)).toMatchObject({ tab: "PRESCRITORES" });
    const none = await pullCentral(prisma, brand.slug, new Date(Date.now() + 3_600_000));
    expect(none.rows).toEqual([]);
    expect(await prisma.sheetSync.findUnique({ where: { brandId_sheet: { brandId: brand.id, sheet: "central" } } })).toMatchObject({ lastPushAt: expect.any(Date), lastPullAt: expect.any(Date) });
  });
});
