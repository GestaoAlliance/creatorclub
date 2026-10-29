import { describe, expect, it } from "vitest";
import { nextTier } from "@/domain";

describe("tabela mensal (D-TIERKIT)", () => {
  it("3 primeiros meses: o mês da entrada e os dois seguintes; vale a maior das duas tabelas", async () => {
    const { isTierTrialMonth, tierProducts } = await import("@/domain");
    expect(["2026-09", "2026-10", "2026-11", "2026-12"].map((m) => isTierTrialMonth("2026-09-15", m))).toEqual([true, true, true, false]);
    expect(isTierTrialMonth("2026-11-20", "2027-01")).toBe(true);
    expect(isTierTrialMonth("2026-11-20", "2027-02")).toBe(false);
    expect([49_999, 50_000, 99_999, 400_000, 600_000, 1_000_000].map((c) => tierProducts(c, true))).toEqual([0, 1, 1, 2, 3, 4]);
    expect([50_000, 100_000, 399_999, 400_000, 599_999, 600_000, 999_999, 2_000_000].map((c) => tierProducts(c, false))).toEqual([0, 1, 1, 2, 2, 3, 3, 4]);
  });
});

describe("próxima faixa (D-KITPROGRESS)", () => {
  it("menor faixa acima das vendas que dá mais produtos; null na faixa mais alta", () => {
    expect(nextTier(0, false)).toEqual({ fromCents: 100_000, total: 1 });
    expect(nextTier(120_000, false)).toEqual({ fromCents: 400_000, total: 2 });
    expect(nextTier(30_000, true)).toEqual({ fromCents: 50_000, total: 1 });
    expect(nextTier(60_000, true)).toEqual({ fromCents: 400_000, total: 2 });
    expect(nextTier(1_200_000, false)).toBeNull();
  });
});
