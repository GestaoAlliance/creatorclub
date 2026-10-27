import { describe, expect, it } from "vitest";
import { goalWindow, goalWindowsUntil } from "@/domain";

describe("janelas da meta de vendas (D-GOALKIT)", () => {
  it("primeiros 45 dias, depois janelas fixas de 30", () => {
    expect(goalWindow("2026-10-27", 0)).toEqual({ index: 0, from: "2026-10-27", to: "2026-12-11" });
    expect(goalWindow("2026-10-27", 1)).toEqual({ index: 1, from: "2026-12-11", to: "2027-01-10" });
    expect(goalWindow("2026-10-27", 2)).toEqual({ index: 2, from: "2027-01-10", to: "2027-02-09" });
    expect(goalWindowsUntil("2026-10-27", "2026-10-26")).toEqual([]);
    expect(goalWindowsUntil("2026-10-27", "2026-12-10").map((w) => w.index)).toEqual([0]);
    expect(goalWindowsUntil("2026-10-27", "2026-12-11").map((w) => w.index)).toEqual([0, 1]);
  });
});
