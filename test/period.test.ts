import { describe, expect, it } from "vitest";
import { resolvePeriod } from "../src/lib/portal/period";
import { T } from "./helpers";

const now = T("2026-10-09T23:30:00Z"); // 20:30 de 09/10 em São Paulo
const tz = "America/Sao_Paulo";

describe("período do portal", () => {
  it("presets em dias de São Paulo", () => {
    const hoje = resolvePeriod({ p: "hoje" }, now, tz);
    expect([hoje.firstDay, hoje.lastDay, hoje.from.toISOString(), hoje.to.toISOString()]).toEqual([
      "2026-10-09", "2026-10-09", "2026-10-09T03:00:00.000Z", "2026-10-10T03:00:00.000Z",
    ]);
    expect(resolvePeriod({ p: "ontem" }, now, tz).firstDay).toBe("2026-10-08");
    expect(resolvePeriod({ p: "7d" }, now, tz).days).toEqual(["2026-10-03", "2026-10-04", "2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09"]);
    const mes = resolvePeriod({}, now, tz);
    expect([mes.preset, mes.firstDay, mes.lastDay, mes.days.length]).toEqual(["mes", "2026-10-01", "2026-10-09", 9]);
  });

  it("personalizado: datas válidas, nunca depois de hoje, no máximo 366 dias; senão volta para Este mês", () => {
    expect(resolvePeriod({ p: "custom", de: "2026-09-01", ate: "2026-09-30" }, now, tz)).toMatchObject({ preset: "custom", firstDay: "2026-09-01", lastDay: "2026-09-30" });
    expect(resolvePeriod({ p: "custom", de: "2026-10-01", ate: "2026-12-31" }, now, tz).lastDay).toBe("2026-10-09");
    expect(resolvePeriod({ p: "custom", de: "2026-09-30", ate: "2026-09-01" }, now, tz).preset).toBe("mes");
    expect(resolvePeriod({ p: "custom", de: "2024-01-01", ate: "2026-10-01" }, now, tz).preset).toBe("mes");
    expect(resolvePeriod({ p: "custom", de: "2026-02-30", ate: "2026-03-01" }, now, tz).preset).toBe("mes");
  });
});
