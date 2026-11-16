import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { loadActor } from "@/lib/auth/actor";
import { calendarOf, cancelExtension, extendWindow, revertWindowExtensions, updateCalendar } from "@/lib/brands/calendar";
import { expectDbError, seedBrand, testClient } from "./fixtures";

const prisma = testClient();
afterAll(() => prisma.$disconnect());

async function user(role: "SUPER_ADMIN" | "PAGAMENTO", brandId: string | null) {
  const id = randomUUID();
  await prisma.user.create({ data: { id, email: `${id}@x.com`, name: role, roleGrants: { create: { role, brandId } } } });
  return (await loadActor(prisma, id))!;
}

describe("calendário de pagamentos da marca (D-CALENDAR, banco real)", () => {
  it("só super admin muda; estender vale no mês e volta sozinho no seguinte; tudo no histórico", async () => {
    const { brand } = await seedBrand(prisma);
    const admin = await user("SUPER_ADMIN", null);
    const NOV = new Date("2026-11-16T15:00:00Z");
    await expect(updateCalendar(prisma, await user("PAGAMENTO", brand.id), brand.id, { start: 5, end: 15, payFrom: 20, payBy: 25 }, NOV)).rejects.toThrow(/super admin/);
    await expect(updateCalendar(prisma, admin, brand.id, { start: 5, end: 26, payFrom: 20, payBy: 25 }, NOV)).rejects.toThrow(/depois do fim do pedido/);
    await updateCalendar(prisma, admin, brand.id, { start: 5, end: 15, payFrom: 20, payBy: 25 }, NOV);

    await expect(extendWindow(prisma, admin, brand.id, 25, NOV)).rejects.toThrow(/antes do fim do pagamento/);
    await extendWindow(prisma, admin, brand.id, 22, NOV);
    let b = await prisma.brand.findUniqueOrThrow({ where: { id: brand.id } });
    expect([b.withdrawalWindowEndDay, b.windowExtensionMonth, b.windowNormalEndDay]).toEqual([22, "2026-11", 15]);
    expect(calendarOf(b, NOV)).toMatchObject({ normalEnd: 15, extended: true });

    // Mudar a data normal no meio da extensão: a extensão continua; o normal novo vale no mês seguinte.
    await updateCalendar(prisma, admin, brand.id, { start: 5, end: 14, payFrom: 20, payBy: 25 }, NOV);
    b = await prisma.brand.findUniqueOrThrow({ where: { id: brand.id } });
    expect([b.withdrawalWindowEndDay, b.windowNormalEndDay]).toEqual([22, 14]);

    expect(await revertWindowExtensions(prisma, NOV)).toBe(0);
    expect(await revertWindowExtensions(prisma, new Date("2026-12-01T04:00:00Z"))).toBeGreaterThanOrEqual(1);
    b = await prisma.brand.findUniqueOrThrow({ where: { id: brand.id } });
    expect([b.withdrawalWindowEndDay, b.windowExtensionMonth, b.windowNormalEndDay]).toEqual([14, null, null]);
    expect(await prisma.auditLog.count({ where: { entityId: brand.id, action: { in: ["brand.calendar", "brand.window_extended", "brand.window_restored"] } } })).toBe(4);

    await extendWindow(prisma, admin, brand.id, 18, NOV);
    await cancelExtension(prisma, admin, brand.id, NOV);
    expect((await prisma.brand.findUniqueOrThrow({ where: { id: brand.id } })).withdrawalWindowEndDay).toBe(14);
    await expect(cancelExtension(prisma, admin, brand.id, NOV)).rejects.toThrow(/não está estendida/);
    await expectDbError(prisma.brand.update({ where: { id: brand.id }, data: { windowExtensionMonth: "2026-11", windowNormalEndDay: 20 } }), /Brand_window_extension_valid/);
  });
});
