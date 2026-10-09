import { describe, expect, it } from "vitest";
import { saleStatus } from "../src/lib/portal/sales";
import { T } from "./helpers";

const now = T("2026-10-10T12:00:00Z");
const e = (amountCents: number, availableAt: string) => ({ amountCents, availableAt: T(availableAt) });

describe("situação da venda no portal", () => {
  it("a liberar, liberada, estorno parcial, estornada e em conferência", () => {
    expect(saleStatus([e(3_000, "2026-10-12T00:00:00Z")], 1500, now)).toBe("HELD");
    expect(saleStatus([e(3_000, "2026-10-01T00:00:00Z")], 1500, now)).toBe("RELEASED");
    expect(saleStatus([e(3_000, "2026-10-01T00:00:00Z"), e(-1_000, "2026-10-05T00:00:00Z")], 1500, now)).toBe("PARTIAL_REFUND");
    expect(saleStatus([e(3_000, "2026-10-01T00:00:00Z"), e(-3_000, "2026-10-05T00:00:00Z")], 1500, now)).toBe("REVERSED");
    expect(saleStatus([], null, now)).toBe("PENDING_RATE");
  });
});
