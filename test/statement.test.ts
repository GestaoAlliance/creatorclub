import { describe, expect, it } from "vitest";
import { entryMonth, isMonthKey, monthKey } from "../src/domain";
import { T } from "./helpers";

describe("mês do extrato (D-MONTH)", () => {
  it("usa o fuso de São Paulo: 1º do mês às 01:00 UTC ainda é o mês anterior", () => {
    expect(monthKey(T("2026-10-01T01:00:00Z"))).toBe("2026-09");
    expect(monthKey(T("2026-10-01T03:00:00Z"))).toBe("2026-10");
  });

  it("lançamento de pedido conta no mês do pagamento; o resto, no mês em que foi lançado", () => {
    // Estorno lançado em outubro de um pedido pago em setembro fica em setembro.
    expect(entryMonth({ createdAt: T("2026-10-05T12:00:00Z"), orderPaidAt: T("2026-09-28T12:00:00Z") })).toBe("2026-09");
    expect(entryMonth({ createdAt: T("2026-10-05T12:00:00Z"), orderPaidAt: null })).toBe("2026-10");
  });

  it("aceita só AAAA-MM válido", () => {
    expect(isMonthKey("2026-09")).toBe(true);
    for (const bad of ["2026-13", "2026-9", "26-09", "2026-00", "2026-09-01", ""]) expect(isMonthKey(bad)).toBe(false);
  });
});
