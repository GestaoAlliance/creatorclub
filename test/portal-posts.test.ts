import { describe, expect, it } from "vitest";
import { igShortcode, postFormat, postIdeas, postingWeeks, postInsights, tiktokDay, weekStart, weekStreak } from "@/domain";

describe("Meus posts no portal (D-PORTALPOSTS)", () => {
  it("formato pelo link ou pelo tipo do Instagram; código do post", () => {
    expect(postFormat("https://www.instagram.com/reel/ABC/", "INSTAGRAM")).toBe("Reels");
    expect(postFormat("https://www.instagram.com/p/ABC/", "INSTAGRAM")).toBe("Foto ou carrossel");
    expect(postFormat("https://www.instagram.com/p/ABC/", "INSTAGRAM", { mediaType: "VIDEO", productType: "REELS" })).toBe("Reels");
    expect(postFormat("https://www.tiktok.com/@a/video/1", "TIKTOK")).toBe("TikTok");
    expect(postFormat("https://x.com/a", "OUTRO")).toBe("Outro");
    expect(igShortcode("https://www.instagram.com/julia/reel/AbC1/?igsh=x")).toBe("abc1");
    expect(igShortcode("https://www.tiktok.com/@a/video/1")).toBeNull();
  });
  it("melhor formato e dia: precisa de 2+ posts em 2 grupos e ignora janela aberta", () => {
    const p = (postedDay: string, format: "Reels" | "TikTok", commissionCents: number, complete = true) => ({ postedDay, format, commissionCents, complete });
    const r = postInsights([p("2026-11-02", "Reels", 5000), p("2026-11-09", "Reels", 7000), p("2026-11-04", "TikTok", 1000), p("2026-11-05", "TikTok", 3000), p("2026-11-10", "TikTok", 99_999, false)]);
    expect(r.format).toEqual({ name: "Reels", avgCents: 6000, posts: 2 });
    expect(r.weekday).toBeNull(); // segunda tem 2, as outras 1
    expect(postInsights([p("2026-11-02", "Reels", 5000)])).toEqual({ format: null, weekday: null });
  });
  it("semanas: sequência até a atual (atual sem post não quebra) e com post x sem post", () => {
    expect(weekStart("2026-11-12")).toBe("2026-11-09");
    expect(weekStart("2026-11-09")).toBe("2026-11-09");
    expect(weekStart("2026-11-15")).toBe("2026-11-09");
    const s = weekStreak(["2026-11-03", "2026-10-28", "2026-10-15"], "2026-11-12");
    expect(s.streak).toBe(2);
    expect(s.weeks.map((w) => w.posted)).toEqual([false, false, false, true, false, true, true, false]);
    expect(weekStreak(["2026-11-12", "2026-11-03"], "2026-11-12").streak).toBe(2);
    expect(postingWeeks([{ posted: true, commissionCents: 100 }, { posted: true, commissionCents: 300 }, { posted: false, commissionCents: 50 }, { posted: false, commissionCents: 0 }])).toEqual({ withCents: 200, withoutCents: 25 });
    expect(postingWeeks([{ posted: true, commissionCents: 100 }, { posted: false, commissionCents: 50 }])).toBeNull();
  });
  it("ideias: campanha primeiro, produtos dela, mudam com a semana", () => {
    const a = postIdeas(["Hair", "NAC"], "Esquenta", 0, "produto");
    expect(a).toHaveLength(3);
    expect(a[0]).toContain("Esquenta");
    expect(a[1]).toContain("Hair");
    expect(postIdeas(["Hair"], null, 1, "x")).not.toEqual(postIdeas(["Hair"], null, 2, "x"));
    expect(postIdeas([], null, 0, "produto da Botanika")[0]).toContain("produto da Botanika");
  });
  it("dia do vídeo do TikTok pelo link", () => {
    const seconds = Date.UTC(2026, 10, 10, 15, 0, 0) / 1000;
    const id = (BigInt(seconds) << 32n) + 12345n;
    expect(tiktokDay(`https://www.tiktok.com/@julia/video/${id}`, "America/Sao_Paulo")).toBe("2026-11-10");
    expect(tiktokDay("https://www.tiktok.com/@julia/video/123", "America/Sao_Paulo")).toBeNull();
    expect(tiktokDay("https://vm.tiktok.com/ZMabc/", "America/Sao_Paulo")).toBeNull();
  });
});

describe("link do hunter por marca (D-HUNTERLINKBRAND)", () => {
  it("/i/código/marca", async () => {
    const { hunterUrl } = await import("@/domain");
    expect(hunterUrl("https://creatorclub.app.br", "fatima", "revita-derma")).toBe("https://creatorclub.app.br/i/fatima/revita-derma");
  });
});
