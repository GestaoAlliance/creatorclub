import { describe, expect, it } from "vitest";
import { monthlyRange, spreadOwed } from "@/lib/payouts/monthly";

describe("quadro Mês a mês (D-PERIODPICK)", () => {
  it("12 meses até o fim do período; com Ano, os meses do ano", () => {
    expect(monthlyRange({ to: "2026-11-17", key: "m:2026-11" })).toEqual(["2025-12", "2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10", "2026-11"]);
    expect(monthlyRange({ to: "2026-03-31", key: "y:2026" })).toEqual(["2026-01", "2026-02", "2026-03"]);
  });

  it("o que falta pagar fica nos meses mais novos (os Pix pagam primeiro os antigos)", () => {
    const rel = new Map([["2026-08", 1_000], ["2026-09", 2_000], ["2026-10", 500]]);
    expect([...spreadOwed(2_000, rel)]).toEqual([["2026-10", 500], ["2026-09", 1_500]]);
    expect([...spreadOwed(0, rel)]).toEqual([]);
    expect([...spreadOwed(-300, rel)]).toEqual([]);
    // Bônus fora de comissão: a sobra fica no mês liberado mais novo.
    expect([...spreadOwed(4_000, rel)]).toEqual([["2026-10", 1_000], ["2026-09", 2_000], ["2026-08", 1_000]]);
  });
});
