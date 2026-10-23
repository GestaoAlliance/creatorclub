import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { freightCentsOf, readEnvios } from "@/lib/sheets/envios";
import { seedBrand, testClient } from "./fixtures";

const prisma = testClient();
afterAll(() => prisma.$disconnect());

const row = (n: number, v: Record<string, unknown>) => ({ tab: "Página1", row: n, values: v });

describe("Planilha de envios só leitura (D-SHEETREADONLY S2, banco real)", () => {
  it("cada linha vira um envio; Sim com rastreio = Enviado; não duplica; completa envio da equipe; sem par vira aviso", async () => {
    const { brand, creator, account } = await seedBrand(prisma);
    await prisma.creatorAccount.update({ where: { id: account.id }, data: { cpf: "52998224725" } });
    const base = { NOME: account.name, CPF: "renata@x.com", "E-MAIL": "529.982.247-25", ENDEREÇO: "Rua A, 1, Betim/MG", PRODUTOS: "Hair e Sleep" };

    // Primeira leitura (histórico): CPF e e-mail trocados de coluna ainda acham a creator; sem aviso à creator.
    const r1 = await readEnvios(prisma, brand.slug, [row(3, { ...base, "ENVIADO?": "Sim", "CÓDIGO DE RASTREIO": "IA468951739BR" }), row(4, { ...base, PRODUTOS: "Whey", "ENVIADO?": "Não" })]);
    expect(r1).toMatchObject({ baseline: true, matched: 2, created: 2, shipped: 1 });
    const ships = await prisma.shipment.findMany({ where: { creatorId: creator.id }, orderBy: { createdAt: "asc" } });
    expect(ships.map((s) => s.status).sort()).toEqual(["PREPARING", "SHIPPED"]);
    const sent = ships.find((s) => s.status === "SHIPPED")!;
    expect(sent).toMatchObject({ trackingCode: "IA468951739BR", carrier: "Correios", address: { raw: "Rua A, 1, Betim/MG" } });
    expect(sent.note).toContain("Hair e Sleep");
    expect(await prisma.notification.count({ where: { creatorId: creator.id } })).toBe(0);

    // Lida de novo: nada duplica. A linha 4 passa a Enviado: o mesmo envio muda e a creator é avisada.
    const r2 = await readEnvios(prisma, brand.slug, [row(3, { ...base, "ENVIADO?": "Sim", "CÓDIGO DE RASTREIO": "IA468951739BR" }), row(4, { ...base, PRODUTOS: "Whey", "ENVIADO?": "Sim", "CÓDIGO DE RASTREIO": "IU135085525BR" })]);
    expect(r2).toMatchObject({ baseline: false, created: 0, shipped: 1 });
    expect(await prisma.shipment.count({ where: { creatorId: creator.id } })).toBe(2);
    expect(await prisma.shipment.count({ where: { creatorId: creator.id, status: "SHIPPED" } })).toBe(2);
    expect(await prisma.notification.count({ where: { creatorId: creator.id } })).toBe(1);

    // Envio criado pela equipe, ainda sem rastreio: a linha nova com rastreio completa esse envio.
    const team = await prisma.shipment.create({ data: { brandId: brand.id, creatorId: creator.id, address: { raw: "x" }, createdById: randomUUID() } });
    const r3 = await readEnvios(prisma, brand.slug, [row(5, { ...base, PRODUTOS: "Kit", "ENVIADO?": "Sim", "CÓDIGO DE RASTREIO": "IA000000001BR" })]);
    expect(r3).toMatchObject({ created: 0, shipped: 1 });
    expect(await prisma.shipment.findUniqueOrThrow({ where: { id: team.id } })).toMatchObject({ status: "SHIPPED", trackingCode: "IA000000001BR" });

    // Sem creator no sistema: aviso, nada criado.
    const r4 = await readEnvios(prisma, brand.slug, [row(9, { NOME: "Pessoa Nova", CPF: "11144477735", "ENVIADO?": "Sim", "CÓDIGO DE RASTREIO": "IA000000002BR" })]);
    expect(r4).toMatchObject({ unmatched: 1, created: 0 });
    expect(await prisma.sheetSyncIssue.count({ where: { brandId: brand.id, sheet: "envios", message: { contains: "Pessoa Nova" } } })).toBe(1);
  });

  it("S4: planilha da VermeFree com FRETE: o frete vai para o envio; não troca o que a equipe pôs", async () => {
    expect([freightCentsOf("R$ 85,90"), freightCentsOf("R$ 1.020,00"), freightCentsOf("10"), freightCentsOf(""), freightCentsOf("grátis")]).toEqual([8_590, 102_000, 1_000, null, null]);
    const { brand, creator, account } = await seedBrand(prisma);
    await prisma.creatorAccount.update({ where: { id: account.id }, data: { cpf: "52998224725" } });
    const vf = { NOME: account.name, TELEFONE: "(11) 9", CPF: "529.982.247-25", "E-MAIL": "", ENDEREÇO: "Rua B", PRODUTOS: "1 kit adulto" };
    await readEnvios(prisma, brand.slug, [row(3, { ...vf, "ENVIADO?": "Sim", "CÓDIGO DE RASTREIO": "AD869265066BR", FRETE: "R$ 85,90" }), row(4, { ...vf, "ENVIADO?": "Não", FRETE: "" })]);
    const ships = await prisma.shipment.findMany({ where: { creatorId: creator.id }, orderBy: { freightCents: "asc" } });
    expect(ships.map((s) => s.freightCents)).toEqual([8_590, null]);
    // A equipe corrige o frete no sistema; a planilha não troca. O envio sem frete ganha o frete quando a planilha preenche.
    await prisma.shipment.update({ where: { id: ships[0]!.id }, data: { freightCents: 9_000 } });
    await readEnvios(prisma, brand.slug, [row(3, { ...vf, "ENVIADO?": "Sim", "CÓDIGO DE RASTREIO": "AD869265066BR", FRETE: "R$ 85,90" }), row(4, { ...vf, "ENVIADO?": "Não", FRETE: "R$ 20,00" })]);
    expect((await prisma.shipment.findMany({ where: { creatorId: creator.id } })).map((s) => s.freightCents).sort()).toEqual([2_000, 9_000]);
  });
});
