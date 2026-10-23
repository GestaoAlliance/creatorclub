import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { loadActor } from "@/lib/auth/actor";
import { previousWeek, runWeeklySummaries } from "@/lib/notifications/weekly";
import { WhatsAppError, type WhatsAppMessage } from "@/lib/notifications/whatsapp";
import { setStaffPhone } from "@/lib/team/invites";
import { seedBrand, testClient } from "./fixtures";

const prisma = testClient();
afterAll(() => prisma.$disconnect());

const MONDAY_9H = new Date("2026-10-26T12:00:00Z"); // segunda, 9h em São Paulo
const SUNDAY = new Date("2026-10-25T15:00:00Z");

async function user(role: "GESTAO" | "PAGAMENTO" | "SUPER_ADMIN", brandId: string | null) {
  const id = randomUUID();
  await prisma.user.create({ data: { id, email: `${id}@x.com`, name: role, roleGrants: { create: { role, brandId } } } });
  return (await loadActor(prisma, id))!;
}

describe("resumo semanal da gestão (M3.4, D-WEEKLY, banco real)", () => {
  it("WhatsApp da equipe; segunda 9h; Gestão da marca com WhatsApp; uma vez por semana; falha tenta de novo", async () => {
    expect(previousWeek(MONDAY_9H)).toEqual({ monday: "2026-10-26", from: "2026-10-19", to: "2026-10-25" });
    const a = await seedBrand(prisma);
    const off = await seedBrand(prisma); // marca sem WhatsApp: não manda
    await prisma.brand.update({ where: { id: a.brand.id }, data: { whatsappInstance: "Botanika" } });
    const sa = await user("SUPER_ADMIN", null);
    const ana = await user("GESTAO", a.brand.id);
    const juci = await user("PAGAMENTO", a.brand.id);
    const outra = await user("GESTAO", off.brand.id);
    await expect(setStaffPhone(prisma, ana, ana.userId, "31 99876")).rejects.toThrow();
    await expect(setStaffPhone(prisma, sa, ana.userId, "123")).rejects.toThrow(/WhatsApp inválido/);
    await setStaffPhone(prisma, sa, ana.userId, "(31) 99876-5432");
    await setStaffPhone(prisma, sa, juci.userId, "(31) 91111-2222");
    await setStaffPhone(prisma, sa, outra.userId, "(11) 92222-3333");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: ana.userId } })).phone).toBe("5531998765432");

    const sent: WhatsAppMessage[] = [];
    const sender = async (m: WhatsAppMessage) => void sent.push(m);
    expect(await runWeeklySummaries(prisma, sender, "https://x.test", SUNDAY)).toBe(0);
    expect(await runWeeklySummaries(prisma, null, "https://x.test", MONDAY_9H)).toBe(0);

    // Primeira tentativa falha: nada fica marcado.
    await runWeeklySummaries(prisma, async () => { throw new WhatsAppError("fora"); }, "https://x.test", MONDAY_9H);
    expect(await prisma.summaryRun.count({ where: { userId: ana.userId } })).toBe(0);

    while ((await runWeeklySummaries(prisma, sender, "https://x.test", MONDAY_9H)) > 0);
    const mine = sent.filter((m) => m.brand === a.brand.name);
    expect(mine.find((m) => m.phone === "5531998765432")).toMatchObject({ instance: "Botanika", kind: "WEEKLY_SUMMARY", text: expect.stringContaining(`*Resumo semanal · ${a.brand.name}*`) });
    expect(mine.find((m) => m.phone === "5531998765432")!.text).toContain("19/10 a 25/10");
    expect(sent.some((m) => m.phone === "5531911112222")).toBe(false); // Pagamento não recebe
    expect(sent.some((m) => m.phone === "5511922223333")).toBe(false); // marca sem WhatsApp
    const before = sent.length;
    await runWeeklySummaries(prisma, sender, "https://x.test", new Date("2026-10-26T15:00:00Z"));
    expect(sent.filter((m) => m.phone === "5531998765432" && m.brand === a.brand.name)).toHaveLength(1); // uma vez por semana
    expect(sent.length).toBe(before);
  });
});
