import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { loadActor } from "@/lib/auth/actor";
import { setSheetReading, sheetDisabled } from "@/lib/sheets/switch";
import { expectDbError, seedBrand, testClient } from "./fixtures";

const prisma = testClient();
afterAll(() => prisma.$disconnect());

async function user(role: "SUPER_ADMIN" | "GESTAO", brandId: string | null) {
  const id = randomUUID();
  await prisma.user.create({ data: { id, email: `${id}@x.com`, name: role, roleGrants: { create: { role, brandId } } } });
  return (await loadActor(prisma, id))!;
}

describe("desligar planilhas (M4.7, D-SHEETOFF, banco real)", () => {
  it("só super admin desliga e religa; religar a Central zera o ponto de partida; Envios guarda; auditoria; trava", async () => {
    const { brand } = await seedBrand(prisma);
    const admin = await user("SUPER_ADMIN", null);
    await expect(setSheetReading(prisma, await user("GESTAO", brand.id), brand.id, "central", false)).rejects.toThrow(/super admin/);
    await expect(setSheetReading(prisma, admin, brand.id, "outra", false)).rejects.toThrow(/desconhecida/);
    await prisma.sheetSync.createMany({ data: [{ brandId: brand.id, sheet: "central", snapshot: { a: { b: "c" } } }, { brandId: brand.id, sheet: "envios", snapshot: { k: "s1" } }] });

    await setSheetReading(prisma, admin, brand.id, "central", false, new Date("2026-11-01T12:00:00Z"));
    await setSheetReading(prisma, admin, brand.id, "envios", false);
    await setSheetReading(prisma, admin, brand.id, "pagamentos", false); // nunca lida: cria a linha desligada
    expect(await sheetDisabled(prisma, brand.slug, "central")).toEqual(new Date("2026-11-01T12:00:00Z"));
    expect(await sheetDisabled(prisma, brand.slug, "pagamentos")).not.toBeNull();

    await setSheetReading(prisma, admin, brand.id, "central", true);
    await setSheetReading(prisma, admin, brand.id, "envios", true);
    const rows = await prisma.sheetSync.findMany({ where: { brandId: brand.id }, orderBy: { sheet: "asc" } });
    expect(rows.map((r) => [r.sheet, r.disabledAt === null, r.snapshot])).toEqual([["central", true, null], ["envios", true, { k: "s1" }], ["pagamentos", false, null]]);
    expect(await prisma.auditLog.count({ where: { entityId: { startsWith: brand.id }, action: { in: ["sheet.on", "sheet.off"] } } })).toBe(5);
    await expectDbError(prisma.sheetSync.update({ where: { brandId_sheet: { brandId: brand.id, sheet: "central" } }, data: { disabledAt: new Date() } }), /SheetSync_disabled/);
  });
});
