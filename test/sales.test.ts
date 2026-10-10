import { describe, expect, it } from "vitest";
import { saleStatus } from "../src/lib/portal/sales";

const e = (amountCents: number) => ({ amountCents });

describe("situação da venda no portal", () => {
  it("a liberar, liberada, estorno parcial, estornada e em conferência", () => {
    // D-CONTRACT: liberada = o mês do pagamento já foi liberado no fechamento.
    expect(saleStatus([e(3_000)], 1500, false)).toBe("HELD");
    expect(saleStatus([e(3_000)], 1500, true)).toBe("RELEASED");
    expect(saleStatus([e(3_000), e(-1_000)], 1500, true)).toBe("PARTIAL_REFUND");
    expect(saleStatus([e(3_000), e(-3_000)], 1500, false)).toBe("REVERSED");
    expect(saleStatus([], null, false)).toBe("PENDING_RATE");
  });
});
