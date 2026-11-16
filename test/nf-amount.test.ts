import { describe, expect, it } from "vitest";
import { nfBreakdown } from "@/domain";

const c = (month: string, cents: number, type = "COMMISSION") => ({ type, amountCents: cents, month, held: false });

describe("valor da nota com a conta aberta (D-NFAMOUNT)", () => {
  it("caso da Julia: comissão liberada jul–out, menos o já pago antes; novembro fica para a próxima nota", () => {
    const e = [c("2026-07", 52808), c("2026-08", 202845), c("2026-09", 166934), c("2026-10", 150515), c("2026-11", 108406), { type: "OPENING_BALANCE", amountCents: -354732, month: "2026-11", held: false }];
    const b = nfBreakdown(e, "2026-10", 0, 218370);
    expect(b.lines.map((l) => [l.label, l.cents])).toEqual([
      ["Comissão de julho", 52808],
      ["Comissão de agosto", 202845],
      ["Comissão de setembro", 166934],
      ["Comissão de outubro", 150515],
      ["Já pago antes do Creator Club", -354732],
    ]);
    expect(b.lines.reduce((s, l) => s + l.cents, 0)).toBe(218370);
    expect(b.next).toEqual([{ month: "2026-11", cents: 108406 }]);
  });

  it("saque em andamento, saques pagos, estorno de mês não liberado e o que não se encaixa", () => {
    const e = [c("2026-09", 10000), { type: "WITHDRAWAL", amountCents: -4000, month: "2026-10", held: false }, c("2026-11", -500, "REVERSAL"), { type: "PRIZE", amountCents: 3000, month: "2026-11", held: true }];
    const b = nfBreakdown(e, "2026-10", 2000, 3000);
    expect(b.lines.map((l) => l.key)).toEqual(["c:2026-09", "e:2026-11", "WITHDRAWAL", "RESERVED", "OTHER"]);
    expect(b.lines.reduce((s, l) => s + l.cents, 0)).toBe(3000);
    expect(b.heldOtherCents).toBe(3000);
    expect(nfBreakdown([c("2026-11", 500)], null, 0, 0)).toEqual({ lines: [], totalCents: 0, next: [{ month: "2026-11", cents: 500 }], heldOtherCents: 0 });
  });
});
