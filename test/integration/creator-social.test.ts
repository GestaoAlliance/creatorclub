import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, describe, expect, it } from "vitest";
import { loadActor } from "@/lib/auth/actor";
import { creatorProfile, updateContact } from "@/lib/creators/profile";
import { approveApplication, receiveApplication } from "@/lib/onboarding/applications";
import { portalContext } from "@/lib/portal/context";
import { updateMyTiktok } from "@/lib/portal/social";
import type { ShopifyClient } from "@/lib/shopify/client";
import { letters, seedBrand, testClient } from "./fixtures";

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

describe("redes do formulário no cadastro da creator (D-SOCIALFILL)", () => {
  const shopify = { shop: "x", graphql: async () => ({ discountCodeBasicCreate: { codeDiscountNode: { id: "gid://shopify/DiscountCodeNode/1" }, userErrors: [] } }) } as unknown as ShopifyClient;
  const clientFor = async () => shopify;

  it("aprovar copia o Instagram e o TikTok respondidos; resposta inválida fica de fora", async () => {
    const { brand } = await seedBrand(prisma);
    const gid = randomUUID();
    await prisma.user.create({ data: { id: gid, email: `${gid}@x.com`, name: "Ana", roleGrants: { create: { role: "GESTAO", brandId: brand.id } } } });
    const gestao = (await loadActor(prisma, gid))!;
    const answers = (email: string, tiktok: string) => ({ "Seu nome completo:": "Bia", "EMAIL:": email, "@ DO SEU INSTAGRAM:": "https://instagram.com/bia.insta/", "@ DO SEU TIKTOK:": tiktok });

    const ok = await receiveApplication(prisma, { brandSlug: brand.slug, source: "hunter_form", externalKey: randomUUID(), submittedAt: new Date(), answers: answers(`${randomUUID()}@x.com`, "@Bia_TT") });
    const r = await approveApplication(prisma, gestao, { applicationId: ok.id, contractSigned: true, couponCode: letters(6), category: "INFLUENCER", rateBps: 1500, discountBps: 500 }, clientFor);
    expect((await prisma.creatorAccount.findUniqueOrThrow({ where: { id: r.accountId } }))).toMatchObject({ instagram: "bia.insta", tiktok: "Bia_TT" });

    const none = await receiveApplication(prisma, { brandSlug: brand.slug, source: "hunter_form", externalKey: randomUUID(), submittedAt: new Date(), answers: answers(`${randomUUID()}@x.com`, "não tenho") });
    const r2 = await approveApplication(prisma, gestao, { applicationId: none.id, contractSigned: true, couponCode: letters(6), category: "INFLUENCER", rateBps: 1500, discountBps: 500 }, clientFor);
    expect((await prisma.creatorAccount.findUniqueOrThrow({ where: { id: r2.accountId } })).tiktok).toBeNull();
  });

  it("a migração preenche as já aprovadas sem trocar o que a equipe já pôs", async () => {
    const a = await seedBrand(prisma);
    const b = await seedBrand(prisma);
    await prisma.creatorAccount.update({ where: { id: a.account.id }, data: { instagram: null, tiktok: null } });
    await prisma.creatorAccount.update({ where: { id: b.account.id }, data: { instagram: "ja.tinha", tiktok: null } });
    const uid = randomUUID();
    await prisma.user.create({ data: { id: uid, email: `${uid}@x.com`, name: "Ana" } });
    const app = (brandId: string, creatorId: string, instagram: string, tiktok: string) =>
      prisma.creatorApplication.create({ data: { brandId, creatorId, source: "hunter_form", externalKey: randomUUID(), submittedAt: new Date(), decidedAt: new Date(), decidedById: uid, status: "APPROVED", fullName: "X", instagram, tiktok, raw: {} } });
    await app(a.brand.id, a.creator.id, "@nova.insta", "https://www.tiktok.com/@nova_tt?lang=pt");
    await app(b.brand.id, b.creator.id, "outro.insta", "-");

    await prisma.$executeRawUnsafe(readFileSync("prisma/migrations/20261022200000_backfill_social_from_applications/migration.sql", "utf8"));
    expect(await prisma.creatorAccount.findUniqueOrThrow({ where: { id: a.account.id } })).toMatchObject({ instagram: "nova.insta", tiktok: "nova_tt" });
    expect(await prisma.creatorAccount.findUniqueOrThrow({ where: { id: b.account.id } })).toMatchObject({ instagram: "ja.tinha", tiktok: null });
  });
});
