import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { readEnvios } from "@/lib/sheets/envios";
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
});
