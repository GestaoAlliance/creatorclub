import { describe, expect, it } from "vitest";
import { isUgc, isUgcOnly, isValidVideoGoal, normalizeVideoUrl, ugcCycle } from "@/domain";

describe("ciclo da UGC (D-UGCQUOTA, D-UGCVIDEOS)", () => {
  const base = { start: "2026-09-01", end: "2026-12-01", goal: 3 };

  it("conta só os vídeos com data dentro do contrato, inclusive nas pontas", () => {
    const c = ugcCycle({ ...base, videoDays: ["2026-08-31", "2026-09-01", "2026-10-15", "2026-12-02"] }, "2026-10-20");
    expect(c).toMatchObject({ count: 2, outside: 2, goal: 3, status: "OPEN" });
    expect(ugcCycle({ ...base, videoDays: ["2026-12-01"] }, "2026-10-20").count).toBe(1);
  });

  it("meta batida, meta perdida depois do fim e sem contrato", () => {
    expect(ugcCycle({ ...base, videoDays: ["2026-09-02", "2026-09-03", "2026-09-04"] }, "2026-10-20").status).toBe("DONE");
    expect(ugcCycle({ ...base, videoDays: ["2026-09-02"] }, "2026-12-01").status).toBe("OPEN");
    expect(ugcCycle({ ...base, videoDays: ["2026-09-02"] }, "2026-12-02").status).toBe("MISSED");
    expect(ugcCycle({ start: null, end: null, goal: null, videoDays: ["2026-09-02"] }, "2026-10-20")).toMatchObject({ status: "NO_CONTRACT", goal: 9, count: 0, outside: 1 });
  });

  it("link, meta e tipo", () => {
    expect(normalizeVideoUrl("  https://drive.google.com/file/d/abc/view ")).toBe("https://drive.google.com/file/d/abc/view");
    expect(normalizeVideoUrl("drive.google.com/x")).toBeNull();
    expect(normalizeVideoUrl("https://x.com/a b")).toBeNull();
    expect(normalizeVideoUrl(`https://x.com/${"a".repeat(500)}`)).toBeNull();
    expect([0, 1, 9, 100, 101, 2.5].map(isValidVideoGoal)).toEqual([false, true, true, true, false, false]);
    expect(isUgc(["INFLUENCER", "UGC"])).toBe(true);
    expect(isUgc(["INFLUENCER"])).toBe(false);
    expect([["UGC"], ["UGC", "INFLUENCER"], [], ["PRESCRIBER"]].map(isUgcOnly)).toEqual([true, false, false, false]);
  });
});
