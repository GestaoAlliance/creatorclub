import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { loadActor } from "@/lib/auth/actor";
import type { WhatsAppMessage } from "@/lib/notifications/whatsapp";
import { FIRST_KIT_NOTICE_JOB, FIRST_KIT_SPACING_MS, firstKitAudience, sendFirstKitNotice, startFirstKitNotices } from "@/lib/shipments/first-kit-notice";
import { seedBrand, testClient } from "./fixtures";

const prisma = testClient();

async function user(role: "SUPER_ADMIN" | "GESTAO", brandId: string | null) {
  const id = randomUUID();
  await prisma.user.create({ data: { id, email: `${id}@x.com`, name: role, roleGrants: { create: { role, brandId } } } });
  return (await loadActor(prisma, id))!;
}

/** Creator que ganhou o 1º produto pela migração do D-FIRSTKIT (`kit.first` no histórico). */
async function firstKit(brandId: string, name: string, phone: string | null, viaMigration = true) {
  const account = await prisma.creatorAccount.create({ data: { name, email: `${randomUUID()}@x.com`, phone } });
  const creator = await prisma.creator.create({ data: { brandId, accountId: account.id, categories: ["INFLUENCER"] } });
  const grant = await prisma.kitGrant.create({ data: { brandId, creatorId: creator.id, kind: "WELCOME", month: "2026-10", salesCents: 0, products: 1 } });
  if (viaMigration) await prisma.auditLog.create({ data: { brandId, actorType: "SYSTEM", actorId: "migration:first_kit", action: "kit.first", entity: "Creator", entityId: creator.id } });
  return grant;
}

describe("aviso do 1º produto (D-FIRSTKITNOTICE, banco real)", () => {
  it("só o super admin dispara; vai espaçado, uma vez, só para quem ainda não pediu e tem celular", async () => {
    const { brand } = await seedBrand(prisma);
    await prisma.brand.update({ where: { id: brand.id }, data: { whatsappInstance: "botanika" } });
    const a = await firstKit(brand.id, "Ana Souza", "(11) 98888-7777");
    const b = await firstKit(brand.id, "Bia Lima", "11977776666");
    await firstKit(brand.id, "Sem Celular", null);
    await firstKit(brand.id, "Aprovada Agora", "11966665555", false); // kit da assinatura: já recebeu a mensagem dela

    expect((await firstKitAudience(prisma, brand.id)).names.sort()).toEqual(["Ana Souza", "Bia Lima"]);
    await expect(startFirstKitNotices(prisma, await user("GESTAO", brand.id), brand.id)).rejects.toThrow(/super admin/);

    const sa = await user("SUPER_ADMIN", null);
    const now = new Date("2026-11-03T15:00:00Z"); // 12h em São Paulo
    expect(await startFirstKitNotices(prisma, sa, brand.id, now)).toEqual({ queued: 2 });
    const jobs = await prisma.job.findMany({ where: { type: FIRST_KIT_NOTICE_JOB, brandId: brand.id }, orderBy: { runAt: "asc" } });
    expect(jobs.map((j) => j.runAt.getTime() - now.getTime())).toEqual([0, FIRST_KIT_SPACING_MS]);
    expect((await firstKitAudience(prisma, brand.id)).grantIds).toHaveLength(0); // clicar de novo não repete
    await expect(startFirstKitNotices(prisma, sa, brand.id, now)).rejects.toThrow(/Ninguém/);

    const msgs: WhatsAppMessage[] = [];
    const sender = async (m: WhatsAppMessage) => void msgs.push(m);
    expect(await sendFirstKitNotice(prisma, sender, a.id, now)).toBe(true);
    expect(msgs[0]).toMatchObject({ kind: "FIRST_KIT", phone: "5511988887777", instance: "botanika" });
    expect(msgs[0]!.text).toMatch(/Oi, Ana!.*\/portal\/marca-.*\/envios/s);

    // Pausada antes da vez dela: não manda.
    await prisma.creator.update({ where: { id: b.creatorId }, data: { status: "INACTIVE" } });
    expect(await sendFirstKitNotice(prisma, sender, b.id, now)).toBe(false);

    // Fora do horário: volta para a fila no próximo 9h.
    const late = new Date("2026-11-03T23:30:00Z");
    const c = await firstKit(brand.id, "Carla Dias", "11955554444");
    expect(await sendFirstKitNotice(prisma, sender, c.id, late)).toBe(false);
    expect((await prisma.job.findFirstOrThrow({ where: { type: FIRST_KIT_NOTICE_JOB, dedupeKey: { startsWith: `first-kit-notice:${c.id}:` } } })).runAt.toISOString()).toBe("2026-11-04T12:00:00.000Z");
    expect(msgs).toHaveLength(1);
  });
});
