import { describe, expect, it } from "vitest";
import { bestFormat, captionHasCoupon, engagementBps, engagementDrop, followerGrowth, igFormat, lastPostAt, postsPerWeekX100, salesPerThousandFollowers, type IgPost } from "@/domain";

const NOW = new Date("2026-10-28T12:00:00Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000);
let n = 0;
const post = (o: Partial<IgPost> = {}): IgPost => ({ id: String(++n), at: daysAgo(1), type: "IMAGE", likes: 90, comments: 10, caption: null, permalink: "https://instagram.com/p/x", ...o });

describe("Instagram (M5.3, D-INSTAGRAM)", () => {
  it("formato e engajamento em pontos-base", () => {
    expect(igFormat({ type: "VIDEO", productType: "REELS" })).toBe("REELS");
    expect(igFormat({ type: "VIDEO" })).toBe("VIDEO");
    expect(igFormat({ type: "CAROUSEL_ALBUM" })).toBe("CAROUSEL");
    expect(engagementBps([post(), post({ likes: 290 })], 10_000)).toBe(200); // média 200 por post = 2%
    expect(engagementBps([], 10_000)).toBeNull();
    expect(engagementBps([post()], 0)).toBeNull();
  });

  it("frequência, último post e melhor formato", () => {
    const ps = [post({ at: daysAgo(2) }), post({ at: daysAgo(9) }), post({ at: daysAgo(40) })];
    expect(postsPerWeekX100(ps, NOW)).toBe(50);
    expect(lastPostAt(ps)).toEqual(daysAgo(2));
    const mix = [post({ type: "VIDEO", productType: "REELS", likes: 500 }), post({ type: "VIDEO", productType: "REELS", likes: 300 }), post(), post(), post({ type: "CAROUSEL_ALBUM", likes: 9999 })];
    expect(bestFormat(mix, 10_000)).toEqual({ format: "REELS", bps: 410 });
  });

  it("queda de engajamento: 40% ou mais avisa; poucos posts não compara", () => {
    const base = [50, 60, 70].map((d) => post({ at: daysAgo(d), likes: 190 })); // 200 por post
    const recentLow = [5, 10, 15].map((d) => post({ at: daysAgo(d), likes: 110 })); // 120 por post
    expect(engagementDrop([...base, ...recentLow], 10_000, NOW)).toEqual({ dropBps: 4000, alert: true });
    const recentOk = [5, 10, 15].map((d) => post({ at: daysAgo(d), likes: 150 })); // 160 por post
    expect(engagementDrop([...base, ...recentOk], 10_000, NOW)).toEqual({ dropBps: 2000, alert: false });
    expect(engagementDrop([...base, post({ at: daysAgo(3) })], 10_000, NOW)).toBeNull();
  });

  it("venda por mil seguidores, cupom na legenda e crescimento", () => {
    expect(salesPerThousandFollowers(150_000, 30_000)).toBe(5_000);
    expect(salesPerThousandFollowers(1, 0)).toBeNull();
    expect(captionHasCoupon("Use o cupom maria10 e ganhe!", "MARIA10")).toBe(true);
    expect(captionHasCoupon("cupom MARIA100", "MARIA10")).toBe(false);
    expect(captionHasCoupon("CÓDIGO: JOÃO15.", "JOAO15")).toBe(true);
    expect(captionHasCoupon(null, "X")).toBe(false);
    expect(followerGrowth([{ day: "2026-10-28", followers: 1200 }, { day: "2026-10-01", followers: 1000 }])).toEqual({ from: 1000, to: 1200, delta: 200 });
    expect(followerGrowth([{ day: "2026-10-01", followers: 1 }])).toBeNull();
  });
});

describe("API da Meta (D-INSTAGRAM)", async () => {
  const { discoverProfile, brandTags, GraphError } = await import("@/lib/instagram/graph");
  const reply = (body: unknown) => async () => ({ ok: true, status: 200, json: async () => body });
  it("limite da Meta vira erro para tentar de novo; perfil não profissional vira não lido", async () => {
    await expect(discoverProfile(reply({ error: { code: 4, message: "Application request limit reached" } }), "t", "1", "ana")).rejects.toBeInstanceOf(GraphError);
    expect(await discoverProfile(reply({ error: { code: 110, error_subcode: 2207013 } }), "t", "1", "ana")).toEqual({ status: "UNREADABLE" });
    const ok = await discoverProfile(reply({ business_discovery: { followers_count: 10, media_count: 1, media: { data: [{ id: "m", timestamp: "2026-10-01T10:00:00+0000", media_type: "CAROUSEL_ALBUM", like_count: 3, permalink: "https://x" }, { id: "sem-data" }] } } }), "t", "1", "ana");
    expect(ok).toEqual({ status: "OK", followers: 10, mediaCount: 1, posts: [expect.objectContaining({ id: "m", mediaType: "CAROUSEL_ALBUM", likes: 3, comments: null, postedAt: new Date("2026-10-01T10:00:00Z") })] });
  });
  it("posts que marcam a marca seguem as páginas", async () => {
    let calls = 0;
    const f = async (url: string) => {
      calls++;
      const page = url.includes("after=2") ? { data: [{ id: "b", username: "Bia", timestamp: "2026-10-02T10:00:00+0000", permalink: "https://b" }] } : { data: [{ id: "a", username: "Ana", timestamp: "2026-10-01T10:00:00+0000", permalink: "https://a" }], paging: { next: "https://graph.facebook.com/next?after=2" } };
      return { ok: true, status: 200, json: async () => page };
    };
    expect((await brandTags(f, "t", "1")).map((t) => t.username)).toEqual(["ana", "bia"]);
    expect(calls).toBe(2);
  });
});
