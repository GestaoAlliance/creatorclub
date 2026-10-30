import { describe, expect, it } from "vitest";
import { actionDetail, fillWithdrawalDays, nextTier, partnershipTerms, payDaysText, requestDaysText, tierProducts, withdrawalApproveText, withdrawalPayText } from "@/domain";
import { helpText } from "@/domain/tutorial";

const REVITA = { start: 5, end: 15, payFrom: 20, payBy: 25 };

describe("regras da Revita pelo contrato novo (D-REVITARULES)", () => {
  it("produtos: R$ 1.000 → 1, R$ 2.000 → 2, sem tabela dos primeiros meses; Botanika igual", () => {
    expect([99_999, 100_000, 199_999, 200_000, 900_000].map((c) => tierProducts(c, true, "revita-derma"))).toEqual([0, 1, 1, 2, 2]);
    expect(nextTier(150_000, false, "revita-derma")).toEqual({ fromCents: 200_000, total: 2 });
    expect(nextTier(250_000, false, "revita-derma")).toBeNull();
    expect(tierProducts(50_000, true)).toBe(1); // Botanika: R$ 500 nos 3 primeiros meses
  });

  it("dias do saque e do pagamento nos textos", () => {
    expect(requestDaysText(REVITA)).toBe("do dia 5 ao 15");
    expect(payDaysText(REVITA)).toBe("do dia 20 ao 25");
    expect(payDaysText()).toBe("até o dia 15");
    expect(fillWithdrawalDays("{Pedido}, Pix {pagamento}.", REVITA)).toBe("Do dia 5 ao 15, Pix do dia 20 ao 25.");
    expect(helpText("saque-saldo", false, REVITA)).toContain("abre do dia 5 ao 15");
    expect(helpText("saldo")).toContain("Do dia 1 ao 10");
    const terms = partnershipTerms({ discountBps: 500, commissionBps: 1000, minInfluencerCents: 10_000, minPrescritorCents: 10_000, months: 6, ugcMonths: null, commissionBasis: true, days: REVITA, noTerm: true });
    expect(terms.map((t) => t.title)).toEqual(expect.arrayContaining(["Saque do dia 5 ao 15", "Contrato sem prazo"]));
    expect(terms.find((t) => t.title.startsWith("Saque"))!.text).toContain("do dia 20 ao 25");
  });

  it("lembretes da equipe com o prazo da marca; aviso de 2 meses sem venda", () => {
    const list = [{ creator: "Ana", amountCents: 10_000 }];
    expect(withdrawalPayText("Revita", list, 23, null, 25)).toContain("O prazo do Pix é o dia 25 (faltam 2 dias)");
    expect(withdrawalPayText("Revita", list, 27, null, 25)).toContain("o prazo era o dia 25");
    expect(withdrawalApproveText("Revita", list, null, 25)).toContain("pagar até o dia 25");
    expect(actionDetail({ kind: "IDLE", days: 61, contractEnds: true })).toMatch(/encerra com 2 meses sem venda/);
    expect(actionDetail({ kind: "IDLE", days: 61 })).toBe("61 dias sem vender");
  });
});
