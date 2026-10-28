import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { loadActor } from "@/lib/auth/actor";
import type { Fetcher } from "@/lib/instagram/graph";
import { creatorInstagram, engagementDropCount, instagramRanking } from "@/lib/instagram/ranking";
import { enqueueDueInstagram, INSTAGRAM_PROFILE_JOB, readBrandTags, readProfile } from "@/lib/instagram/sync";
import { expectDbError, seedBrand, testClient } from "./fixtures";

const prisma = testClient();
afterAll(() => prisma.$disconnect());

const NOW = new Date("2026-10-28T12:00:00Z"); // 9h em São Paulo
const ago = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString().replace(/\.000Z$/, "+0000");

/** Meta de mentira: responde pelo @ pedido. */
function fakeMeta(profiles: Record<string, unknown>, tags: unknown[] = []): Fetcher & { urls: string[] } {
  const urls: string[] = [];
  const f = (async (url: string) => {
    urls.push(url);
    const u = decodeURIComponent(url);
    const body = u.includes("/tags?")
      ? { data: tags }
      : (() => {
          const handle = u.match(/username\(([^)]+)\)/)?.[1] ?? "";
          return profiles[handle] ?? { error: { code: 110, error_subcode: 2207013, message: "Cannot find User" } };
        })();
    return { ok: true, status: 200, json: async () => body };
  }) as Fetcher & { urls: string[] };
  f.urls = urls;
  return f;
}

async function world(handle: string) {
  const s = await seedBrand(prisma);
  const igId = String(Math.floor(Math.random() * 1e15) + 1e15);
  await prisma.brand.update({ where: { id: s.brand.id }, data: { instagramUserId: igId } });
  await prisma.creatorAccount.update({ where: { id: s.account.id }, data: { instagram: `@${handle}` } });
  await prisma.couponAssignment.create({ data: { brandId: s.brand.id, couponId: s.coupon.id, creatorId: s.creator.id, validFrom: new Date("2026-01-01") } });
  const uid = randomUUID();
  await prisma.user.create({ data: { id: uid, email: `${uid}@x.com`, name: "Gestão", roleGrants: { create: { role: "GESTAO", brandId: s.brand.id } } } });
  return { ...s, igId, gestao: (await loadActor(prisma, uid))! };
}

const media = (id: string, daysAgo: number, likes: number, o: Record<string, unknown> = {}) => ({
  id, timestamp: ago(daysAgo), media_type: "VIDEO", media_product_type: "REELS", like_count: likes, comments_count: 10, caption: null, permalink: `https://instagram.com/p/${id}`, ...o,
});

describe("Instagram (D-INSTAGRAM, banco real)", () => {
  it("lê o perfil, guarda seguidores e posts, mostra no ranking e na ficha; mesmo dia não lê de novo", async () => {
    const h = `ana${randomUUID().slice(0, 6)}`;
    const s = await world(h);
    const posts = [
      media(`a${h}1`, 2, 140, { caption: `Use ${s.coupon.code.toLowerCase()}!` }),
      media(`a${h}2`, 9, 140),
      media(`a${h}3`, 20, 140),
      ...[50, 60, 70].map((d, i) => media(`a${h}b${i}`, d, 290)),
    ];
    const meta = fakeMeta({ [h]: { business_discovery: { followers_count: 15_000, media_count: 200, media: { data: posts } } } });
    expect(await readProfile(prisma, s.account.id, meta, "tok", NOW)).toBe("OK");
    expect(await readProfile(prisma, s.account.id, meta, "tok", NOW)).toBe("SKIPPED");
    expect(meta.urls).toHaveLength(1);
    expect(meta.urls[0]).toContain(`/${s.igId}?fields=`);

    const r = await instagramRanking(prisma, s.gestao, s.brand.id, new Map([[s.creator.id, 30_000]]), NOW);
    expect(r.rows).toEqual([
      expect.objectContaining({ status: "OK", handle: h, followers: 15_000, engagementBps: 100, couponPosts: 1, salesPer1kCents: 2_000, drop: { dropBps: 5000, alert: true } }),
    ]);
    expect(await engagementDropCount(prisma, s.brand.id, NOW)).toBe(1);
    const card = await creatorInstagram(prisma, s.gestao, s.creator.id, NOW);
    expect(card).toMatchObject({ handle: h, status: "OK", followers: 15_000 });
    expect(card!.posts[0]).toMatchObject({ hasCoupon: true });
    await expect(instagramRanking(prisma, null, s.brand.id, new Map(), NOW)).rejects.toThrow(/permissão/);
  });

  it("perfil pessoal ou @ errado fica como não lido; posts que marcam a marca ligam à creator", async () => {
    const h = `bia${randomUUID().slice(0, 6)}`;
    const s = await world(h);
    const meta = fakeMeta({}, [{ id: `t${h}`, username: h.toUpperCase(), timestamp: ago(1), permalink: `https://instagram.com/p/t${h}`, like_count: 5, comments_count: 1 }]);
    expect(await readProfile(prisma, s.account.id, meta, "tok", NOW)).toBe("UNREADABLE");
    expect(await readBrandTags(prisma, s.brand.id, meta, "tok")).toBe(1);
    expect(await readBrandTags(prisma, s.brand.id, meta, "tok")).toBe(1); // atualiza, não duplica
    const r = await instagramRanking(prisma, s.gestao, s.brand.id, new Map(), NOW);
    expect(r.rows[0]).toMatchObject({ status: "UNREADABLE" });
    expect(r.tags).toEqual([expect.objectContaining({ username: h, creator: { id: s.creator.id, name: s.account.name } })]);
  });

  it("agenda uma leitura por pessoa ativa por dia, só a partir das 4h e com token", async () => {
    const h = `cris${randomUUID().slice(0, 6)}`;
    const s = await world(h);
    expect(await enqueueDueInstagram(prisma, new Date("2026-10-28T05:00:00Z"), { META_SYSTEM_TOKEN: "x" })).toBe(0); // 2h em SP
    expect(await enqueueDueInstagram(prisma, NOW, {})).toBe(0);
    expect(await enqueueDueInstagram(prisma, NOW, { META_SYSTEM_TOKEN: "x" })).toBeGreaterThan(0);
    expect(await prisma.job.count({ where: { type: INSTAGRAM_PROFILE_JOB, dedupeKey: `ig:profile:${s.account.id}:2026-10-28` } })).toBe(1);
    expect(await enqueueDueInstagram(prisma, NOW, { META_SYSTEM_TOKEN: "x" })).toBe(0);
  });

  it("travas: leitura não muda nem some; @ e números válidos", async () => {
    const s = await world(`dani${randomUUID().slice(0, 6)}`);
    const snap = await prisma.instagramSnapshot.create({ data: { accountId: s.account.id, day: new Date("2026-10-01"), handle: "dani", status: "OK", followers: 10, mediaCount: 1 } });
    await expectDbError(prisma.instagramSnapshot.update({ where: { id: snap.id }, data: { followers: 11 } }), /InstagramSnapshot é somente inserção/);
    await expectDbError(prisma.instagramSnapshot.create({ data: { accountId: s.account.id, day: new Date("2026-10-02"), handle: "Dani!", status: "OK", followers: 1, mediaCount: 1 } }), /InstagramSnapshot_values/);
    await expectDbError(prisma.instagramSnapshot.create({ data: { accountId: s.account.id, day: new Date("2026-10-03"), handle: "dani", status: "OK" } }), /InstagramSnapshot_values/);
    await expectDbError(prisma.brand.update({ where: { id: s.brand.id }, data: { instagramUserId: "abc" } }), /Brand_instagramUserId/);
  });
});
