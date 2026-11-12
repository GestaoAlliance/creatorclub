import { describe, expect, it } from "vitest";
import { DEFAULT_WITHDRAWAL_DAYS, groupPaymentCheck, payoutWhatsapp, rejectReasons, waitingTone, withdrawalWindow } from "../src/domain";

describe("Pagamentos (D-PAYBOARD)", () => {
  it("janela de pedido: aberta com os dias que faltam (contando hoje) ou quando abre", () => {
    expect(withdrawalWindow("2026-11-01", DEFAULT_WITHDRAWAL_DAYS)).toEqual({ open: true, daysLeft: 10, opensIn: null });
    expect(withdrawalWindow("2026-11-10", DEFAULT_WITHDRAWAL_DAYS)).toEqual({ open: true, daysLeft: 1, opensIn: null });
    expect(withdrawalWindow("2026-11-12", DEFAULT_WITHDRAWAL_DAYS)).toEqual({ open: false, daysLeft: null, opensIn: 19 });
    expect(withdrawalWindow("2026-12-31", DEFAULT_WITHDRAWAL_DAYS)).toMatchObject({ opensIn: 1 });
    // Revita: do dia 5 ao 15.
    expect(withdrawalWindow("2026-11-03", { start: 5, end: 15, payFrom: 20, payBy: 25 })).toMatchObject({ open: false, opensIn: 2 });
  });
  it("pedido parado: 3+ dias atenção, 7+ urgente", () => {
    expect([0, 2, 3, 6, 7].map(waitingTone)).toEqual(["ok", "ok", "warn", "warn", "late"]);
  });
  it("motivos de recusa agrupados sem diferença de maiúscula, espaço e ponto final", () => {
    expect(rejectReasons(["CNPJ errado.", "cnpj  errado", "Valor diferente", null, " ", "CNPJ errado"])).toEqual([
      { reason: "CNPJ errado", count: 3 },
      { reason: "Valor diferente", count: 1 },
    ]);
  });
  it("resumo para o WhatsApp sem tabela, com negrito e a janela", () => {
    const t = payoutWhatsapp({ brand: "Botanika", today: "2026-11-05", requested: [{ name: "Ana", cents: 50_000 }], approved: [], window: { open: true, daysLeft: 6, opensIn: null }, endDay: 10 });
    expect(t).toContain("*Saques · Botanika* (05/11)");
    expect(t).toContain("*Em análise (falta aprovar):* 1");
    expect(t).toContain("- Ana: R$");
    expect(t).not.toContain("Aprovados");
    expect(t).toContain("aberta até o dia 10");
    expect(t).not.toContain("|");
  });
  it("conferência por creator: diferença planilha − sistema somada, maior primeiro", () => {
    const line = (coupon: string, creatorId: string | null, pay: number | null, sys: number | null, issues: string[] = []) => ({ coupon, name: coupon, creatorId, creatorName: creatorId ? `C ${creatorId}` : null, payCents: pay, system: sys === null ? null : { commissionCents: sys }, issues });
    const g = groupPaymentCheck([line("A10", "a", 1000, 1000), line("A10", "a", 2000, 1500, ["valor"]), line("B10", "b", 9000, 1000, ["valor"]), line("X1", null, 300, null, ["cupom não está no sistema"])]);
    expect(g.map((x) => [x.key, x.diffCents, x.issues])).toEqual([["b", 8000, 1], ["a", 500, 1], ["cupom:X1", 0, 1]]);
  });
});
