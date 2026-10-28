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
