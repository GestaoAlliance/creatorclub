import { describe, expect, it } from "vitest";
import { achievements, dailyTip, longestMonthStreak, rankBand } from "../src/domain";

describe("Início do portal (D-PORTALHOME)", () => {
  it("meses seguidos: maior sequência sem buraco, virando o ano", () => {
    expect(longestMonthStreak(["2026-01", "2026-02", "2026-04"])).toBe(2);
    expect(longestMonthStreak(["2025-11", "2025-12", "2026-01", "2026-01"])).toBe(3);
    expect(longestMonthStreak([])).toBe(0);
  });
  it("conquistas", () => {
    const a = achievements({ paidOrders: 10, releases: 0, salesMonths: ["2026-08", "2026-09", "2026-10"] });
    expect(a.filter((x) => x.done).map((x) => x.id)).toEqual(["first-sale", "ten-sales", "three-months"]);
  });
  it("faixa de posição: top 10, 25%, metade de cima; abaixo da metade ou sem venda, nada", () => {
    const all = Array.from({ length: 40 }, (_, i) => (40 - i) * 1000); // 40 creators, 40000 … 1000
    expect(rankBand(40_000, all)).toMatch(/10 que mais/);
    expect(rankBand(31_000, all)).toMatch(/10 que mais/); // 10º
    expect(rankBand(30_000, all)).toMatch(/metade de cima/); // 11º de 40: fora das 10 (que já são os 25%)
    const cem = Array.from({ length: 100 }, (_, i) => (100 - i) * 100);
    expect(rankBand(8_600, cem)).toMatch(/25%/); // 15º de 100
    expect(rankBand(21_000, all)).toMatch(/metade de cima/); // 20º
    expect(rankBand(20_000, all)).toBeNull(); // 21º
    expect(rankBand(0, all)).toBeNull();
    expect(rankBand(500, [500, 400, 0, 0])).toMatch(/entre as que mais venderam/);
  });
  it("dica do dia usa os dados dela e troca com o dia", () => {
    const base = { bestFormat: "REELS" as const, bestWeekday: 2, daysSincePost: 9 };
    const tips = new Set([0, 1, 2, 3, 4].map((d) => dailyTip({ ...base, dayOfYear: d })));
    expect(tips.size).toBe(5);
    expect([...tips].some((t) => t.includes("Reels"))).toBe(true);
    expect([...tips].some((t) => t.includes("terça-feira"))).toBe(true);
    expect([...tips].some((t) => t.includes("9 dias"))).toBe(true);
  });
});
