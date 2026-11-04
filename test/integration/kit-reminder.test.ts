import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { loadActor } from "@/lib/auth/actor";
import type { WhatsAppMessage } from "@/lib/notifications/whatsapp";
import { FIRST_KIT_NOTICE_JOB, FIRST_KIT_SPACING_MS } from "@/lib/shipments/first-kit-notice";
import { KIT_REMINDER_JOB, kitReminderAudience, sendKitReminder, startKitReminders } from "@/lib/shipments/kit-reminder";
import { seedBrand, testClient } from "./fixtures";

const prisma = testClient();

async function user(role: "SUPER_ADMIN" | "GESTAO" | "PAGAMENTO", brandId: string | null) {
  const id = randomUUID();
  await prisma.user.create({ data: { id, email: `${id}@x.com`, name: role, roleGrants: { create: { role, brandId } } } });
  return (await loadActor(prisma, id))!;
}

async function pending(brandId: string, name: string, phone: string | null, kind: "WELCOME" | "MONTHLY" = "WELCOME", month = "2026-10", creatorId?: string) {
  const id = creatorId ?? (await prisma.creator.create({ data: { brandId, accountId: (await prisma.creatorAccount.create({ data: { name, email: `${randomUUID()}@x.com`, phone } })).id, categories: ["INFLUENCER"] } })).id;
  return prisma.kitGrant.create({ data: { brandId, creatorId: id, kind, month, salesCents: 0, products: 1 } });
}

describe("lembrete dos produtos parados (D-KITREMINDER, banco real)", () => {
  it("Gestão da marca dispara; uma mensagem por pessoa, uma vez por kit; não repete quem já está no aviso do 1º produto", async () => {
    const { brand } = await seedBrand(prisma);
    const other = await seedBrand(prisma);
    await prisma.brand.update({ where: { id: brand.id }, data: { whatsappInstance: "revita" } });
    const a = await pending(brand.id, "Ana Souza", "(11) 98888-7777");
    await pending(brand.id, "Ana Souza", null, "MONTHLY", "2026-11", a.creatorId); // segundo kit da mesma pessoa
    const b = await pending(brand.id, "Bia Lima", "11977776666", "MONTHLY");
    await pending(brand.id, "Sem Celular", null);
    const c = await pending(brand.id, "Carla Dias", "11955554444");
    await prisma.job.create({ data: { type: FIRST_KIT_NOTICE_JOB, brandId: brand.id, dedupeKey: `first-kit-notice:${c.id}`, payload: {} } });
    const off = await pending(brand.id, "Desligada", "11944443333");
    await prisma.creator.update({ where: { id: off.creatorId }, data: { status: "DEACTIVATED" } });

    expect((await kitReminderAudience(prisma, brand.id)).names.sort()).toEqual(["Ana Souza", "Bia Lima"]);
    await expect(startKitReminders(prisma, await user("GESTAO", other.brand.id), brand.id)).rejects.toThrow(/permissão/);
    await expect(startKitReminders(prisma, await user("PAGAMENTO", brand.id), brand.id)).rejects.toThrow(/permissão/);
    await expect(startKitReminders(prisma, await user("GESTAO", other.brand.id), other.brand.id)).rejects.toThrow(/WhatsApp/);

    const now = new Date("2026-11-04T15:00:00Z"); // 12h em São Paulo
    expect(await startKitReminders(prisma, await user("GESTAO", brand.id), brand.id, now)).toEqual({ queued: 2 });
    const jobs = await prisma.job.findMany({ where: { type: KIT_REMINDER_JOB, brandId: brand.id }, orderBy: { runAt: "asc" } });
    expect(jobs.map((j) => j.runAt.getTime() - now.getTime())).toEqual([0, FIRST_KIT_SPACING_MS]);
    expect((await kitReminderAudience(prisma, brand.id)).grantIds).toHaveLength(0);
    expect(await prisma.auditLog.count({ where: { brandId: brand.id, action: "kit.reminder" } })).toBe(1);

    const msgs: WhatsAppMessage[] = [];
    const sender = async (m: WhatsAppMessage) => void msgs.push(m);
    expect(await sendKitReminder(prisma, sender, a.id, now)).toBe(true);
    expect(msgs[0]).toMatchObject({ kind: "KIT_REMINDER", phone: "5511988887777", instance: "revita" });
    expect(msgs[0]!.text).toMatch(/^Oi, Ana! Seus produtos da .* estão liberados e esperando você escolher 🎁 É só entrar no portal, na aba Pedidos, e escolher: .*\/portal\/marca-.*\/envios$/);

    // Pausada antes da vez dela: não manda.
    await prisma.creator.update({ where: { id: b.creatorId }, data: { status: "INACTIVE" } });
    expect(await sendKitReminder(prisma, sender, b.id, now)).toBe(false);
    expect(msgs).toHaveLength(1);
  });
});
