import { describe, expect, it } from "vitest";
import { weeklySummaryText, type WeeklyData } from "@/domain";

const base: WeeklyData = {
  brand: "Botanika", from: "2026-10-19", to: "2026-10-25",
  sales: { cents: 503_000, change: 12.5, orders: 10, storeShare: 0.916 }, commissionCents: 75_450,
  top: [{ name: "Lia Teste", cents: 223_000 }, { name: "Bruna", cents: 131_000 }],
  profit: { cents: 357_600, revenueCents: 503_000 },
  pending: { applications: 4, toApprove: 1, toPay: 0, actions: 11 },
  alerts: { idle: 1, contracts: 0, nearMin: 2, kits: 9 },
  link: "https://x.test/admin/marca",
};

describe("resumo semanal (M3.4, D-WEEKLY)", () => {
  it("vendas com comparação, top, lucro, pendências e alertas, link do painel", () => {
    const t = weeklySummaryText(base);
    expect(t).toMatch(/^\*Resumo semanal · Botanika\*\n19\/10 a 25\/10/);
    expect(t).toMatch(/Vendas com cupom:\* R\$\s5\.030 \(\+12,5% vs semana anterior\)/);
    expect(t).toMatch(/10 pedidos · 91,6% da loja · comissão R\$\s755/);
    expect(t).toMatch(/Lucro do programa: R\$\s3\.576 \(71,1% da receita\)/);
    expect(t).toContain("1. Lia Teste");
    expect(t).toContain("• 4 candidatas esperando");
    expect(t).toContain("• 1 saque para aprovar");
    expect(t).not.toContain("para pagar");
    expect(t).toContain("• 2 creators perto do mínimo");
    expect(t).not.toContain("contrato");
    expect(t.endsWith("Painel: https://x.test/admin/marca")).toBe(true);
  });

  it("semana vazia: sem top, sem alertas, nada pendente; sem custo: sem lucro", () => {
    const t = weeklySummaryText({ ...base, sales: { cents: 0, change: null, orders: 0, storeShare: 0 }, top: [], profit: null, pending: { applications: 0, toApprove: 0, toPay: 0, actions: 0 }, alerts: { idle: 0, contracts: 0, nearMin: 0, kits: 0 }, link: null });
    expect(t).toContain("sem base na semana anterior");
    expect(t).toContain("nada pendente");
    expect(t).not.toMatch(/Quem mais vendeu|Alertas|Lucro|Painel/);
  });
});
