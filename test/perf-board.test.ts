import { describe, expect, it } from "vitest";
import { growthMovers, postsNoCoupon, ugcCycle, ugcPace } from "../src/domain";

describe("ugcPace (D-PERFBOARD)", () => {
  const cyc = (count: number, today: string) => ugcCycle({ start: "2026-11-01", end: "2026-11-30", goal: 6, videoDays: Array.from({ length: count }, () => "2026-11-02") }, today);
  it("atrasada quando tem menos vídeos que o esperado no ritmo da meta", () => {
    // 15 de 30 dias passados → esperado 3.
    expect(ugcPace(cyc(2, "2026-11-15"), "2026-11-15")).toEqual({ daysLeft: 15, expected: 3, late: true });
    expect(ugcPace(cyc(3, "2026-11-15"), "2026-11-15")).toEqual({ daysLeft: 15, expected: 3, late: false });
  });
  it("no começo ninguém está atrasada; meta batida nunca; ciclo perdido sempre", () => {
    expect(ugcPace(cyc(0, "2026-11-02"), "2026-11-02").late).toBe(false);
    expect(ugcPace(cyc(6, "2026-11-10"), "2026-11-10")).toMatchObject({ late: false, expected: 6 });
    expect(ugcPace(cyc(4, "2026-12-02"), "2026-12-02")).toMatchObject({ late: true, daysLeft: 0 });
  });
  it("sem datas do contrato não tem ritmo", () => {
    const c = ugcCycle({ start: null, end: null, goal: 4, videoDays: [] }, "2026-11-10");
    expect(ugcPace(c, "2026-11-10")).toEqual({ daysLeft: null, expected: null, late: false });
  });
});

describe("Instagram do Desempenho (D-PERFBOARD)", () => {
  const now = new Date("2026-11-12T15:00:00Z");
  it("posta sem cupom: postou em 30 dias e nenhum post com cupom", () => {
    const rows = [
      { id: "a", lastPostAt: new Date("2026-11-10T00:00:00Z"), couponPosts: 0 },
      { id: "b", lastPostAt: new Date("2026-11-10T00:00:00Z"), couponPosts: 2 },
      { id: "c", lastPostAt: new Date("2026-09-01T00:00:00Z"), couponPosts: 0 },
      { id: "d", lastPostAt: null, couponPosts: 0 },
    ];
    expect(postsNoCoupon(rows, now).map((r) => r.id)).toEqual(["a"]);
  });
  it("cresceu e caiu: as 3 de cada lado, sem zero nem sem dado", () => {
    const rows = [5, 300, -40, 0, null, 120, 80, -2, -500].map((growth, i) => ({ id: String(i), growth }));
    const m = growthMovers(rows);
    expect(m.up.map((r) => r.growth)).toEqual([300, 120, 80]);
    expect(m.down.map((r) => r.growth)).toEqual([-500, -40, -2]);
  });
});
