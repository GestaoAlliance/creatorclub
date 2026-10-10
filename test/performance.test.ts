import { describe, expect, it } from "vitest";
import { changeBps, kitProgress, lastMonths, sortPerformance } from "@/domain";

const tiers = [{ fromCents: 100_000, products: 1 }, { fromCents: 200_000, products: 2 }, { fromCents: 1_000_000, products: 3 }];

describe("painel do mês (U4)", () => {
  it("faixa do kit e quanto falta para a próxima", () => {
    expect(kitProgress(tiers, 50_000)).toEqual({ products: 0, nextFromCents: 100_000, nextProducts: 1, missingCents: 50_000 });
    expect(kitProgress(tiers, 250_000)).toEqual({ products: 2, nextFromCents: 1_000_000, nextProducts: 3, missingCents: 750_000 });
    expect(kitProgress(tiers, 1_000_000)).toEqual({ products: 3, nextFromCents: null, nextProducts: null, missingCents: null });
    // Faixa com teto: acima do teto não vale.
    expect(kitProgress([{ fromCents: 100, toCents: 200, products: 2 }], 300).products).toBe(0);
  });

  it("variação contra o mês anterior", () => {
    expect(changeBps(150, 100)).toBe(5000);
    expect(changeBps(50, 100)).toBe(-5000);
    expect(changeBps(10, 0)).toBeNull();
  });

  it("ranking: vendas, mais perto do mínimo (quem já chegou e quem não tem mínimo por último) e nome", () => {
    const r = (name: string, salesCents: number, acc: number | null) => ({ name, salesCents, release: acc === null ? null : { accumulatedCents: acc, minCents: 50_000 } });
    const rows = [r("Bia", 100, 10_000), r("Ana", 900, 60_000), r("Caio", 500, 45_000), r("Duda", 0, null)];
    expect(sortPerformance(rows, "vendas").map((x) => x.name)).toEqual(["Ana", "Caio", "Bia", "Duda"]);
    expect(sortPerformance(rows, "minimo").map((x) => x.name)).toEqual(["Caio", "Bia", "Ana", "Duda"]);
    expect(sortPerformance(rows, "nome").map((x) => x.name)).toEqual(["Ana", "Bia", "Caio", "Duda"]);
  });

  it("últimos meses para escolher, virando o ano", () => {
    expect(lastMonths("2026-02", 4)).toEqual(["2026-02", "2026-01", "2025-12", "2025-11"]);
  });
});
