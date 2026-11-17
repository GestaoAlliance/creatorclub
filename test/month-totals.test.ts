import { describe, expect, it } from "vitest";
import { monthTotals } from "@/lib/payouts/month-board";

describe("totais de Pagamentos (auditoria de 2026-11-17)", () => {
  it("vendas e comissão contam uma vez por creator; notas somam todas; Pix antigos não entram nas vendas", () => {
    const r = (creatorId: string, nfCents: number, legacy = false, month: string | null = legacy ? null : "2026-10") => ({ creatorId, month, legacy, nfCents, salesCents: legacy ? 0 : 10_000, commissionCents: legacy ? 0 : 1_500 });
    expect(monthTotals([r("a", 1_000), r("a", 500), r("b", 1_500), r("a", 300, true)])).toEqual({ nfCents: 3_300, salesCents: 20_000, commissionCents: 3_000 });
    // Filas com meses diferentes: a mesma creator conta uma vez por mês da comissão.
    expect(monthTotals([r("a", 1_000), r("a", 500, false, "2026-09")])).toMatchObject({ salesCents: 20_000, commissionCents: 3_000 });
    expect(monthTotals([])).toEqual({ nfCents: 0, salesCents: 0, commissionCents: 0 });
  });
});
