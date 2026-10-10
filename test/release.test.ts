import { describe, expect, it } from "vitest";
import { accumulatedSales, computeBalance, monthClosesAt, nextMonthKey, planReleases, previousMonthKey, releaseMinFor } from "../src/domain";
import { T } from "./helpers";

const sales = (o: Record<string, number>) => new Map(Object.entries(o));

describe("meses", () => {
  it("vira o ano", () => {
    expect(nextMonthKey("2026-12")).toBe("2027-01");
    expect(previousMonthKey("2027-01")).toBe("2026-12");
  });

  it("o mês fecha à meia-noite do dia 1 em São Paulo", () => {
    expect(monthClosesAt("2026-10")).toEqual(T("2026-11-01T03:00:00Z"));
  });
});

describe("fechamento mensal (D-CONTRACT)", () => {
  it("libera o mês que atinge R$ 500", () => {
    expect(planReleases({ salesByMonth: sales({ "2026-09": 60_000 }), releasedThrough: null, lastClosedMonth: "2026-09", minCents: 50_000 })).toEqual([
      { month: "2026-09", salesCents: 60_000 },
    ]);
  });

  it("abaixo do mínimo acumula para o mês seguinte até atingir", () => {
    const plan = planReleases({
      salesByMonth: sales({ "2026-06": 20_000, "2026-07": 20_000, "2026-08": 15_000, "2026-09": 10_000 }),
      releasedThrough: null,
      lastClosedMonth: "2026-09",
      minCents: 50_000,
    });
    expect(plan).toEqual([{ month: "2026-08", salesCents: 55_000 }]);
  });

  it("mês sem venda no meio continua acumulando; só meses já fechados", () => {
    const plan = planReleases({
      salesByMonth: sales({ "2026-07": 30_000, "2026-09": 30_000, "2026-10": 90_000 }),
      releasedThrough: null,
      lastClosedMonth: "2026-09",
      minCents: 50_000,
    });
    expect(plan).toEqual([{ month: "2026-09", salesCents: 60_000 }]);
  });

  it("começa depois da última liberação e não repete", () => {
    const s = sales({ "2026-08": 90_000, "2026-09": 40_000 });
    expect(planReleases({ salesByMonth: s, releasedThrough: "2026-08", lastClosedMonth: "2026-09", minCents: 50_000 })).toEqual([]);
    expect(planReleases({ salesByMonth: s, releasedThrough: "2026-09", lastClosedMonth: "2026-09", minCents: 50_000 })).toEqual([]);
    expect(accumulatedSales(s, "2026-08", "2026-09")).toBe(40_000);
    expect(accumulatedSales(s, null, "2026-08")).toBe(90_000);
  });

  it("prescritor usa o mínimo de R$ 1.000", () => {
    const brand = { releaseMinCents: 50_000, releaseMinPrescriberCents: 100_000 };
    expect(releaseMinFor(["PRESCRITOR"], brand)).toBe(100_000);
    expect(releaseMinFor(["INFLUENCER"], brand)).toBe(50_000);
    expect(releaseMinFor(["UGC"], brand)).toBe(50_000);
  });
});

describe("saldo com liberação mensal", () => {
  const now = T("2026-10-20T12:00:00Z");
  const old = T("2026-01-01T00:00:00Z");

  it("comissão de mês não liberado fica a liberar; mês liberado fica disponível", () => {
    const b = computeBalance(
      [
        { type: "COMMISSION", amountCents: 9_000, availableAt: old, month: "2026-08" },
        { type: "COMMISSION", amountCents: 6_000, availableAt: old, month: "2026-09" },
        { type: "COMMISSION", amountCents: 3_000, availableAt: old, month: "2026-10" },
      ],
      [],
      now,
      { releasedThrough: "2026-08" },
    );
    expect(b).toEqual({ totalCents: 18_000, heldCents: 9_000, reservedCents: 0, availableCents: 9_000 });
  });

  it("estorno de mês ainda retido abate o retido, não o disponível", () => {
    const b = computeBalance(
      [
        { type: "COMMISSION", amountCents: 9_000, availableAt: old, month: "2026-08" },
        { type: "COMMISSION", amountCents: 6_000, availableAt: old, month: "2026-10" },
        { type: "REVERSAL", amountCents: -6_000, availableAt: now, month: "2026-10" },
      ],
      [],
      now,
      { releasedThrough: "2026-08" },
    );
    expect(b).toMatchObject({ heldCents: 0, availableCents: 9_000 });
  });

  it("estorno de mês já liberado sai do disponível na hora (pode ficar negativo)", () => {
    const b = computeBalance(
      [
        { type: "COMMISSION", amountCents: 9_000, availableAt: old, month: "2026-08" },
        { type: "WITHDRAWAL", amountCents: -9_000, availableAt: old },
        { type: "REVERSAL", amountCents: -2_000, availableAt: now, month: "2026-08" },
      ],
      [],
      now,
      { releasedThrough: "2026-08" },
    );
    expect(b.availableCents).toBe(-2_000);
  });

  it("nada liberado ainda: toda comissão fica a liberar; ajuste e abertura seguem a data", () => {
    const b = computeBalance(
      [
        { type: "COMMISSION", amountCents: 9_000, availableAt: old, month: "2026-08" },
        { type: "ADJUSTMENT", amountCents: 1_000, availableAt: old },
        { type: "OPENING_BALANCE", amountCents: -500, availableAt: old },
      ],
      [],
      now,
      { releasedThrough: null },
    );
    expect(b).toMatchObject({ heldCents: 9_000, availableCents: 500 });
  });
});
