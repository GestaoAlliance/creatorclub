import { afterAll, describe, expect, it } from "vitest";
import { paymentsCheck, readPagamentos } from "@/lib/sheets/pagamentos";
import { commissionEntry, seedBrand, testClient } from "./fixtures";

const prisma = testClient();
afterAll(() => prisma.$disconnect());

describe("Planilha de pagamentos só conferência (D-SHEETREADONLY S3, banco real)", () => {
  it("compara vendas, % e comissão do período com o sistema; não mexe no extrato", async () => {
    const { brand, creator, coupon, order } = await seedBrand(prisma);
    await prisma.couponAssignment.create({ data: { brandId: brand.id, couponId: coupon.id, creatorId: creator.id, validFrom: new Date("2026-01-01T00:00:00Z") } });
    // Pedido de 01/09 (R$ 200) atribuído à creator com 15% e a comissão no extrato.
    await prisma.orderAttribution.create({ data: { brandId: brand.id, orderId: order.id, creatorId: creator.id, couponId: coupon.id, rateBps: 1500, rule: "first", evidenceCodes: [coupon.code] } });
    await prisma.ledgerEntry.create({ data: commissionEntry({ brandId: brand.id, creatorId: creator.id, orderId: order.id }) });
    const ledgerBefore = await prisma.ledgerEntry.count({ where: { creatorId: creator.id } });

    const res = await readPagamentos(prisma, brand.slug, [
      { tab: "VENDAS SETEMBRO/26", row: 3, values: { "Nome completo": "Fulana", Cupom: coupon.code, Pix: "123", "Valor em vendas": "200,00", "% comissão": "15,00%", "Total a ser pago": "R$ 30,00" } },
      { tab: "VENDAS AGOSTO/26", row: 3, values: { "Nome completo": "Fulana", Cupom: coupon.code, "Valor em vendas": "500,00", "% comissão": "10,00%", "Total a ser pago": "R$ 50,00" } },
      { tab: "VENDAS AGOSTO/26", row: 4, values: { "Nome completo": "Outra", Cupom: "NAOEXISTE", "Valor em vendas": "10,00" } },
      { tab: "Página1", row: 3, values: { Cupom: coupon.code } },
    ], new Date("2026-10-19T12:00:00Z"));
    expect(res).toMatchObject({ rows: 3, skipped: 1, tabs: 2 });

    const { rows } = await paymentsCheck(prisma, brand.id);
    const set = rows.find((r) => r.tab === "VENDAS SETEMBRO/26")!;
    expect(set).toMatchObject({ creatorId: creator.id, issues: [], system: { salesCents: 20_000, orders: 1, commissionCents: 3000, rates: [1500] } });
    const ago = rows.find((r) => r.tab === "VENDAS AGOSTO/26" && r.coupon === coupon.code)!;
    expect(ago.issues).toEqual(["vendas diferentes", "comissão diferente"]);
    expect(ago.system).toMatchObject({ salesCents: 0, orders: 0 });
    expect(rows.find((r) => r.coupon === "NAOEXISTE")!.issues).toEqual(["cupom não está no sistema"]);
    // Pix não é guardado; extrato intacto.
    expect(JSON.stringify((await prisma.sheetSync.findUniqueOrThrow({ where: { brandId_sheet: { brandId: brand.id, sheet: "pagamentos" } } })).snapshot)).not.toContain("Pix");
    expect(await prisma.ledgerEntry.count({ where: { creatorId: creator.id } })).toBe(ledgerBefore);
  });
});
