import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { actionQueue } from "@/lib/actions/queue";
import { loadActor } from "@/lib/auth/actor";
import { createCampaign, joinCampaign, publishCampaign } from "@/lib/campaigns/campaigns";
import type { PortalContext } from "@/lib/portal/context";
import { addPost, brandPosts, campaignPosts, creatorPosts, myPosts, removePost } from "@/lib/posts/posts";
import { contentBoard, lastPostDaysAll } from "@/lib/posts/content";
import { expectDbError, seedBrand, testClient } from "./fixtures";

const prisma = testClient();
afterAll(() => prisma.$disconnect());
const T = (s: string) => new Date(s);

async function staff(role: "GESTAO" | "PAGAMENTO", brandId: string) {
  const id = randomUUID();
  await prisma.user.create({ data: { id, email: `${id}@x.com`, name: role, roleGrants: { create: { role, brandId } } } });
  return (await loadActor(prisma, id))!;
}

describe("posts das creators (M4.6, D-POSTS, banco real)", () => {
  it("creator registra e tira; Gestão registra na ficha; vendas em 3 dias × normal; campanha; trava", async () => {
    const { brand, creator, coupon } = await seedBrand(prisma);
    const ctx = { creatorId: creator.id, brand: { id: brand.id }, viewAs: null } as unknown as PortalContext;
    const now = T("2026-10-30T15:00:00Z");
    await expect(addPost(prisma, { kind: "creator", ctx: { ...ctx, viewAs: { userId: "x" } } as PortalContext, userId: "u" }, creator.id, { url: "https://instagram.com/p/a", postedDay: "2026-10-20" }, now)).rejects.toThrow(/Visualização/);
    await expect(addPost(prisma, { kind: "creator", ctx, userId: "u" }, creator.id, { url: "https://instagram.com/p/a", postedDay: "2026-10-31" }, now)).rejects.toThrow(/hoje ou antes/);
    await expect(addPost(prisma, { kind: "creator", ctx, userId: "u" }, creator.id, { url: "https://instagram.com/p/a", postedDay: "2026-08-01" }, now)).rejects.toThrow(/últimos 60 dias/);
    const { id } = await addPost(prisma, { kind: "creator", ctx, userId: "u" }, creator.id, { url: "instagram.com/p/abc", postedDay: "2026-10-20" }, now);
    await expect(addPost(prisma, { kind: "staff", actor: await staff("PAGAMENTO", brand.id) }, creator.id, { url: "https://tiktok.com/@a/video/1", postedDay: "2026-10-28" }, now)).rejects.toThrow(/permissão/);
    const gestao = await staff("GESTAO", brand.id);
    await addPost(prisma, { kind: "staff", actor: gestao }, creator.id, { url: "https://tiktok.com/@a/video/1", postedDay: "2026-10-29" }, now);

    // Vendas: base (14 dias antes de 20/10) R$ 140 → normal em 3 dias R$ 30; janela 20 a 22/10: R$ 250.
    const order = async (cents: number, paidAt: string) => {
      const o = await prisma.order.create({ data: { brandId: brand.id, shopifyId: `gid://shopify/Order/${randomUUID()}`, name: "#p", createdAtShop: T(paidAt), paidAt: T(paidAt), financialStatus: "PAID", subtotalCents: cents, totalCents: cents, discountCodes: [coupon.code], shopifyUpdatedAt: T(paidAt) } });
      await prisma.orderAttribution.create({ data: { brandId: brand.id, orderId: o.id, creatorId: creator.id, couponId: coupon.id, rateBps: 1500, rule: "FIRST_CREATOR_CODE", evidenceCodes: [coupon.code] } });
    };
    await order(14_000, "2026-10-10T15:00:00Z");
    await order(20_000, "2026-10-20T15:00:00Z");
    await order(5_000, "2026-10-23T02:00:00Z"); // 23h de 22/10 em SP: ainda na janela
    await order(9_999, "2026-10-23T03:30:00Z"); // 00:30 de 23/10: fora

    const mine = await myPosts(prisma, ctx, now);
    expect(mine.map((p) => [p.platform, p.postedDay, p.byStaff, p.complete])).toEqual([["TIKTOK", "2026-10-29", true, false], ["INSTAGRAM", "2026-10-20", false, true]]);
    expect(mine[1]).toMatchObject({ url: "https://instagram.com/p/abc", windowCents: 25_000, normalCents: 3_000, aboveCents: 22_000, overlap: false });
    expect((await creatorPosts(prisma, gestao, creator.id, now)).length).toBe(2);
    expect((await brandPosts(prisma, gestao, brand.id, now)).length).toBe(2);

    // Campanha: só se inscrita.
    const camp = await createCampaign(prisma, gestao, brand.id, { name: "C", briefing: "B", startDay: "2026-10-25", endDay: "2026-11-05", categories: [], tagIds: [], rankingPrizes: ["100"], goal: "", goalPrize: "", allianceOsUrl: "" });
    await publishCampaign(prisma, gestao, camp.id, T("2026-10-24T00:00:00Z"));
    await expect(addPost(prisma, { kind: "creator", ctx, userId: "u" }, creator.id, { url: "https://instagram.com/p/c", postedDay: "2026-10-30", campaignId: camp.id }, now)).rejects.toThrow(/inscrita/);
    await joinCampaign(prisma, ctx, camp.id, T("2026-10-26T00:00:00Z"));
    await addPost(prisma, { kind: "creator", ctx, userId: "u" }, creator.id, { url: "https://instagram.com/p/c", postedDay: "2026-10-30", campaignId: camp.id }, now);
    expect((await campaignPosts(prisma, brand.id, camp.id, now)).map((p) => p.url)).toEqual(["https://instagram.com/p/c"]);

    // Tirar: só o dela; some das listas; auditoria.
    const other = await seedBrand(prisma);
    await expect(removePost(prisma, { kind: "creator", ctx: { ...ctx, creatorId: other.creator.id } as PortalContext, userId: "u" }, id)).rejects.toThrow(/permissão/);
    await removePost(prisma, { kind: "creator", ctx, userId: "u" }, id);
    expect((await myPosts(prisma, ctx, now)).some((p) => p.id === id)).toBe(false);
    expect(await prisma.auditLog.count({ where: { entityId: id, action: { in: ["post.add", "post.remove"] } } })).toBe(2);
    await expectDbError(prisma.creatorPost.create({ data: { brandId: brand.id, creatorId: creator.id, url: "http://x.com", platform: "OUTRO", postedDay: "2026-10-01", createdById: "x" } }), /CreatorPost_valid/);
  });

  it("fila de ações: sem post há 15 dias (desde o início dos registros); post recente tira da fila", async () => {
    const { brand, creator } = await seedBrand(prisma);
    await prisma.creator.update({ where: { id: creator.id }, data: { status: "ACTIVE", createdAt: T("2026-01-01T00:00:00Z") } });
    const noPost = async (at: string) => (await actionQueue(prisma, brand.id, T(at))).filter((t) => t.kind === "NO_POST" && t.creatorId === creator.id);
    expect(await noPost("2026-11-07T15:00:00Z")).toEqual([]); // 14 dias desde 24/10
    expect((await noPost("2026-11-08T15:00:00Z"))[0]).toMatchObject({ detail: "nenhum post registrado há 15 dias", owner: "GESTAO" });
    const ctx = { creatorId: creator.id, brand: { id: brand.id }, viewAs: null } as unknown as PortalContext;
    await addPost(prisma, { kind: "creator", ctx, userId: "u" }, creator.id, { url: "https://instagram.com/p/z", postedDay: "2026-11-05" }, T("2026-11-08T15:00:00Z"));
    expect(await noPost("2026-11-08T15:00:00Z")).toEqual([]);
  });
});

describe("conteúdo: posts registrados + detectados no Instagram (D-CONTENTBOARD, banco real)", () => {
  it("marcação vira post da creator pelo @; mesmo link não conta duas vezes; outras menções; quem não postou; Sem post nas ações", async () => {
    const { brand, creator, account, coupon } = await seedBrand(prisma);
    await prisma.creatorAccount.update({ where: { id: account.id }, data: { instagram: "@Maria.Ex" } });
    await prisma.creator.update({ where: { id: creator.id }, data: { createdAt: T("2026-10-01T12:00:00Z") } });
    const acc2 = await prisma.creatorAccount.create({ data: { name: "Bia Lima", email: `${randomUUID()}@x.com`, instagram: "bia" } });
    const c2 = await prisma.creator.create({ data: { brandId: brand.id, accountId: acc2.id, categories: ["INFLUENCER"], createdAt: T("2026-10-01T12:00:00Z") } });
    const now = T("2026-11-20T15:00:00Z");
    const tag = (username: string, postedAt: string, permalink: string, likes = 10) => prisma.instagramTag.create({ data: { brandId: brand.id, mediaId: randomUUID(), username, postedAt: T(postedAt), permalink, likes, comments: 2 } });
    await tag("maria.ex", "2026-11-10T15:00:00Z", "https://www.instagram.com/p/AAA/", 120);
    await tag("maria.ex", "2026-11-12T15:00:00Z", "https://www.instagram.com/reel/BBB/", 50);
    await tag("fulana", "2026-11-11T15:00:00Z", "https://www.instagram.com/p/CCC/");
    const gestao = await staff("GESTAO", brand.id);
    await addPost(prisma, { kind: "staff", actor: gestao }, creator.id, { url: "https://instagram.com/reel/BBB", postedDay: "2026-11-12" }, now);
    const o = await prisma.order.create({ data: { brandId: brand.id, shopifyId: `gid://shopify/Order/${randomUUID()}`, name: "#x", createdAtShop: T("2026-11-10T18:00:00Z"), paidAt: T("2026-11-10T18:00:00Z"), financialStatus: "PAID", subtotalCents: 30_000, totalCents: 30_000, discountCodes: [], shopifyUpdatedAt: now } });
    await prisma.orderAttribution.create({ data: { brandId: brand.id, orderId: o.id, creatorId: creator.id, couponId: coupon.id, rateBps: 1500, rule: "FIRST_CREATOR_CODE", evidenceCodes: [] } });

    const b = await contentBoard(prisma, gestao, brand.id, now);
    expect(b.posts.map((p) => [p.source, p.postedDay, p.likes])).toEqual([["MANUAL", "2026-11-12", 50], ["INSTAGRAM", "2026-11-10", 120]]);
    expect(b.posts[1]).toMatchObject({ creatorId: creator.id, windowCents: 30_000, complete: true });
    expect(b.mentions.map((m) => m.username)).toEqual(["fulana"]);
    expect(b.notPosted.map((x) => x.id)).toEqual([c2.id]);
    expect((await lastPostDaysAll(prisma, brand.id, [creator.id, c2.id])).get(creator.id)).toBe("2026-11-12");

    // Ações: quem marcou a marca não cai em "Sem post"; quem não postou cai.
    const tasks = (await actionQueue(prisma, brand.id, now)).filter((t) => t.kind === "NO_POST").map((t) => t.creatorId);
    expect(tasks).toEqual([c2.id]);
  });
});
