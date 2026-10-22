import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import type { EmailMessage } from "@/lib/email/sender";
import { emailPendingNotices } from "@/lib/notifications/scheduled";
import { whatsappPendingNotices, type WhatsAppMessage } from "@/lib/notifications/whatsapp";
import { expectDbError, seedBrand, testClient } from "./fixtures";

const prisma = testClient();
afterAll(() => prisma.$disconnect());

const IN_HOURS = new Date("2026-10-22T15:00:00Z"); // 12h em São Paulo
const AT_NIGHT = new Date("2026-10-23T01:00:00Z"); // 22h

describe("avisos pelo WhatsApp da marca (M2.2, D-WHATSAPP, banco real)", () => {
  it("manda pela instância da marca, no horário, só das últimas 24 h e com celular; com WhatsApp ligado, sem e-mail", async () => {
    const a = await seedBrand(prisma);
    await prisma.brand.update({ where: { id: a.brand.id }, data: { whatsappInstance: "Botanika Suporte" } });
    const acc = await prisma.creator.findUniqueOrThrow({ where: { id: a.creator.id }, select: { accountId: true } });
    await prisma.creatorAccount.update({ where: { id: acc.accountId }, data: { phone: "(31) 99876-5432" } });
    const noPhone = await seedBrand(prisma); // outra marca, sem instância: fica de fora
    const base = { brandId: a.brand.id, creatorId: a.creator.id, kind: "WITHDRAWAL_PAID", title: "Saque pago", body: "O Pix caiu.", href: `/portal/${a.brand.slug}/saque` };
    const fresh = await prisma.notification.create({ data: { ...base, dedupeKey: `w-${randomUUID()}`, createdAt: new Date(IN_HOURS.getTime() - 3_600_000) } });
    const old = await prisma.notification.create({ data: { ...base, dedupeKey: `w-${randomUUID()}`, createdAt: new Date(IN_HOURS.getTime() - 2 * 86_400_000) } });
    const other = await prisma.notification.create({ data: { ...base, brandId: noPhone.brand.id, creatorId: noPhone.creator.id, dedupeKey: `w-${randomUUID()}`, createdAt: IN_HOURS } });

    const sent: WhatsAppMessage[] = [];
    const sender = async (m: WhatsAppMessage) => void sent.push(m);
    expect(await whatsappPendingNotices(prisma, null, "https://x.test", IN_HOURS)).toBe(0);
    expect(await whatsappPendingNotices(prisma, sender, "https://x.test", AT_NIGHT)).toBe(0);
    while ((await whatsappPendingNotices(prisma, sender, "https://x.test", IN_HOURS)) > 0);
    const mine = sent.filter((m) => m.notificationId === fresh.id);
    expect(mine).toEqual([
      { instance: "Botanika Suporte", phone: "5531998765432", text: `*Saque pago*\n\nO Pix caiu.\n\nhttps://x.test/portal/${a.brand.slug}/saque`, notificationId: fresh.id, kind: "WITHDRAWAL_PAID", brand: a.brand.name },
    ]);
    expect(sent.some((m) => m.notificationId === old.id || m.notificationId === other.id)).toBe(false);
    expect((await prisma.notification.findUniqueOrThrow({ where: { id: fresh.id } })).whatsappAt).toEqual(IN_HOURS);

    // n8n fora do ar: não marca, tenta de novo na próxima rodada.
    const retry = await prisma.notification.create({ data: { ...base, dedupeKey: `w-${randomUUID()}`, createdAt: IN_HOURS } });
    const { WhatsAppError } = await import("@/lib/notifications/whatsapp");
    await whatsappPendingNotices(prisma, async () => { throw new WhatsAppError("fora"); }, null, IN_HOURS);
    expect((await prisma.notification.findUniqueOrThrow({ where: { id: retry.id } })).whatsappAt).toBeNull();

    // E-mail: com WhatsApp ligado, a marca com instância não recebe e-mail; a outra continua.
    const emails: EmailMessage[] = [];
    const mail = async (m: EmailMessage) => (emails.push(m), { id: "x" });
    const recent = await prisma.notification.create({ data: { ...base, dedupeKey: `w-${randomUUID()}` } });
    const elsewhere = await prisma.notification.create({ data: { ...base, brandId: noPhone.brand.id, creatorId: noPhone.creator.id, dedupeKey: `w-${randomUUID()}` } });
    while ((await emailPendingNotices(prisma, mail, "https://x.test", new Date(), { whatsappOn: true })) > 0);
    expect(emails.some((m) => m.idempotencyKey === `notice-${recent.id}`)).toBe(false);
    expect(emails.some((m) => m.idempotencyKey === `notice-${elsewhere.id}`)).toBe(true);

    await expectDbError(prisma.brand.update({ where: { id: a.brand.id }, data: { whatsappInstance: " ruim" } }), /Brand_whatsapp_instance_format/);
  });
});
