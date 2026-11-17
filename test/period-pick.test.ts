import { describe, expect, it } from "vitest";
import { pickPeriod, rangeKey, stepMonth } from "@/domain";

describe("seletor de tempo (D-PERIODPICK)", () => {
  const today = "2026-11-17";
  it("mês, 30 dias, ano e datas; inválido vira o mês atual; nada passa de hoje", () => {
    expect(pickPeriod("m:2026-10", today)).toEqual({ key: "m:2026-10", kind: "month", from: "2026-10-01", to: "2026-10-31", label: "Outubro de 2026", month: "2026-10" });
    expect(pickPeriod("m:2026-11", today)).toMatchObject({ from: "2026-11-01", to: "2026-11-17", label: "Novembro de 2026" });
    expect(pickPeriod("m:2026-12", today).key).toBe("m:2026-11");
    expect(pickPeriod("30d", today)).toMatchObject({ from: "2026-10-19", to: "2026-11-17", label: "Últimos 30 dias" });
    expect(pickPeriod("y:2026", today)).toMatchObject({ from: "2026-01-01", to: "2026-11-17", label: "Ano de 2026" });
    expect(pickPeriod(rangeKey("2026-09-05", "2026-10-10"), today)).toMatchObject({ kind: "range", label: "05/09/2026 a 10/10/2026" });
    expect(pickPeriod("r:2026-10-10:2026-09-05", today).key).toBe("m:2026-11");
    expect(pickPeriod(undefined, today).key).toBe("m:2026-11");
    expect(pickPeriod("lixo", today).key).toBe("m:2026-11");
  });
  it("anda mês a mês sem passar do mês atual", () => {
    expect(stepMonth(pickPeriod("m:2026-01", today), -1, today)).toBe("m:2025-12");
    expect(stepMonth(pickPeriod("m:2026-10", today), 1, today)).toBe("m:2026-11");
    expect(stepMonth(pickPeriod("m:2026-11", today), 1, today)).toBe("m:2026-11");
    expect(stepMonth(pickPeriod("30d", today), -1, today)).toBe("m:2026-11");
  });
});
