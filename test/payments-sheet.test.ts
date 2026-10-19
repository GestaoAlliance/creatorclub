import { describe, expect, it } from "vitest";
import { moneyToCents, paymentPeriod, percentToBpsText } from "@/domain";

const now = new Date("2026-10-19T12:00:00Z");

describe("Planilha de pagamentos", () => {
  it("lê o período da aba", () => {
    expect(paymentPeriod("VENDAS AGOSTO/26", now)).toEqual({ from: "2026-08-01", to: "2026-08-31" });
    expect(paymentPeriod("VENDAS SETEMBRO/26", now)).toEqual({ from: "2026-09-01", to: "2026-09-30" });
    expect(paymentPeriod("VALOR EM VENDAS DO DIA 23/06 AO DIA 31/07", now)).toEqual({ from: "2026-06-23", to: "2026-07-31" });
    expect(paymentPeriod("Março", now)).toEqual({ from: "2026-03-01", to: "2026-03-31" });
    expect(paymentPeriod("DEZEMBRO", now)).toEqual({ from: "2025-12-01", to: "2025-12-31" });
    expect(paymentPeriod("Página1", now)).toBeNull();
  });
  it("lê dinheiro e porcentagem", () => {
    expect(moneyToCents("R$ 3.520,58")).toBe(352058);
    expect(moneyToCents("94.379,57")).toBe(9437957);
    expect(moneyToCents("")).toBeNull();
    expect(moneyToCents("PENDENTE")).toBeNull();
    expect(percentToBpsText("15,00%")).toBe(1500);
    expect(percentToBpsText("10%")).toBe(1000);
  });
});
