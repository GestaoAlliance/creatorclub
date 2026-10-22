import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { loadActor } from "@/lib/auth/actor";
import { creatorProfile, updateContact } from "@/lib/creators/profile";
import { portalContext } from "@/lib/portal/context";
import { updateMyTiktok } from "@/lib/portal/social";
import { seedBrand, testClient } from "./fixtures";

const prisma = testClient();
afterAll(() => prisma.$disconnect());

describe("Instagram e TikTok da creator (banco real)", () => {
  it("a equipe preenche e corrige as redes na ficha; vazio apaga, sem o campo não mexe", async () => {
    const { brand, creator, account } = await seedBrand(prisma);
    const gid = randomUUID();
    await prisma.user.create({ data: { id: gid, email: `${gid}@x.com`, name: "Ana", roleGrants: { create: { role: "GESTAO", brandId: brand.id } } } });
    const ana = (await loadActor(prisma, gid))!;
    const base = { name: account.name, email: account.email, phone: "" };

    await updateContact(prisma, ana, creator.id, { ...base, instagram: "https://instagram.com/maria.oficial/", tiktok: " @Maria_TT " });
    expect(await creatorProfile(prisma, ana, creator.id)).toMatchObject({ instagram: "maria.oficial", tiktok: "Maria_TT" });

    await updateContact(prisma, ana, creator.id, base);
    expect(await creatorProfile(prisma, ana, creator.id)).toMatchObject({ instagram: "maria.oficial", tiktok: "Maria_TT" });

    await updateContact(prisma, ana, creator.id, { ...base, instagram: "maria.oficial", tiktok: "" });
    expect((await creatorProfile(prisma, ana, creator.id)).tiktok).toBeNull();
    const last = await prisma.auditLog.findFirstOrThrow({ where: { action: "creator.contact", entityId: account.id }, orderBy: { createdAt: "desc" } });
    expect(last.before).toMatchObject({ tiktok: "Maria_TT" });
  });

  it("a creator informa o próprio TikTok no portal; visualização da equipe não altera", async () => {
    const a = await seedBrand(prisma);
    const userId = randomUUID();
    await prisma.user.create({ data: { id: userId, email: `${userId}@x.com`, name: "Creator" } });
    await prisma.creatorAccount.update({ where: { id: a.account.id }, data: { userId } });
    const ctx = await portalContext(prisma, (await loadActor(prisma, userId))!, a.brand.slug);

    await expect(updateMyTiktok(prisma, ctx, userId, "@")).rejects.toThrow(/TikTok/);
    await expect(updateMyTiktok(prisma, ctx, userId, "tem espaço!")).rejects.toThrow(/TikTok/);
    expect(await updateMyTiktok(prisma, ctx, userId, "https://www.tiktok.com/@mari.tt?lang=pt")).toBe("mari.tt");
    expect((await prisma.creatorAccount.findUniqueOrThrow({ where: { id: a.account.id } })).tiktok).toBe("mari.tt");
    expect(await prisma.auditLog.count({ where: { action: "creator.tiktok", entityId: a.account.id } })).toBe(1);

    await expect(updateMyTiktok(prisma, { ...ctx, viewAs: { userId: randomUUID() } }, userId, "outro")).rejects.toThrow(/Visualização da equipe/);
  });
});
