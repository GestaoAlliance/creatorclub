import { describe, expect, it } from "vitest";
import { addDaysKey, dayKey, isDayKey, nextDayKey, startOfLocalDay } from "../src/domain";
import { T } from "./helpers";

describe("dias no fuso da marca", () => {
  it("dia local e início do dia em São Paulo (UTC−3)", () => {
    expect(dayKey(T("2026-10-10T02:59:00Z"))).toBe("2026-10-09");
    expect(dayKey(T("2026-10-10T03:00:00Z"))).toBe("2026-10-10");
    expect(startOfLocalDay("2026-10-10").toISOString()).toBe("2026-10-10T03:00:00.000Z");
  });

  it("funciona em fuso com horário de verão", () => {
    expect(startOfLocalDay("2026-07-01", "America/New_York").toISOString()).toBe("2026-07-01T04:00:00.000Z");
    expect(startOfLocalDay("2026-01-15", "America/New_York").toISOString()).toBe("2026-01-15T05:00:00.000Z");
  });

  it("valida e avança datas", () => {
    expect(isDayKey("2026-02-28")).toBe(true);
    expect(isDayKey("2026-02-30")).toBe(false);
    expect(isDayKey("26-02-01")).toBe(false);
    expect(nextDayKey("2026-02-28")).toBe("2026-03-01");
    expect(addDaysKey("2026-10-01", -6)).toBe("2026-09-25");
  });
});
