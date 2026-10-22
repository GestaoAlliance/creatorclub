import { describe, expect, it } from "vitest";
import { saleReason, salesCsv, saleStatus } from "@/domain";

const o = (financialStatus: string, extra: { cancelledAt?: Date | null; test?: boolean } = {}) => ({ financialStatus, cancelledAt: null, test: false, ...extra });

describe("vendas da equipe (M0.1)", () => {
  it("situação da venda: a mesma régua da comissão", () => {
    expect(saleStatus(o("PAID"))).toBe("PAID");
    expect(saleStatus(o("PARTIALLY_REFUNDED"))).toBe("PAID");
    expect(saleStatus(o("PENDING"))).toBe("PENDING");
    expect(saleStatus(o("AUTHORIZED"))).toBe("PENDING");
    expect(saleStatus(o("REFUNDED"))).toBe("REFUNDED");
    expect(saleStatus(o("EXPIRED"))).toBe("REFUNDED");
    // Cancelada e teste valem antes da situação de pagamento.
    expect(saleStatus(o("PAID", { cancelledAt: new Date() }))).toBe("CANCELLED");
    expect(saleStatus(o("PAID", { test: true, cancelledAt: new Date() }))).toBe("TEST");
  });

  it("motivo de a venda estar (ou não) com uma creator", () => {
    expect(saleReason({ creatorCoupon: "MARIA", codes: ["MARIA"], coupons: [] })).toBe("cupom de creator MARIA");
    expect(saleReason({ creatorCoupon: null, codes: [], coupons: [] })).toBe("sem cupom");
    expect(saleReason({ creatorCoupon: null, codes: ["BLACK"], coupons: [{ code: "BLACK", kind: "PROMO" }] })).toMatch(/PROMO/);
    expect(saleReason({ creatorCoupon: null, codes: ["NOVO"], coupons: [{ code: "NOVO", kind: null }] })).toMatch(/sem tipo/);
    expect(saleReason({ creatorCoupon: null, codes: ["ANA"], coupons: [{ code: "ANA", kind: "CREATOR" }] })).toMatch(/sem dona/);
    expect(saleReason({ creatorCoupon: null, codes: ["XYZ"], coupons: [null] })).toBe("cupom fora do sistema");
  });

  it("CSV com BOM, ponto e vírgula, vírgula decimal e aspas quando precisa", () => {
    const csv = salesCsv([
      { date: "21/10/2026 16:25", order: "#1001", status: "PAID", subtotalCents: 6990, totalCents: 8490, codes: ["MARIA"], creator: "Maria; Silva", reason: "cupom de creator MARIA", commissionCents: 699 },
      { date: "21/10/2026 16:30", order: "#1002", status: "PENDING", subtotalCents: 100, totalCents: 100, codes: [], creator: null, reason: "sem cupom", commissionCents: null },
    ]);
    expect(csv.startsWith("﻿Data;Pedido;Situação")).toBe(true);
    const lines = csv.trim().split("\r\n");
    expect(lines[1]).toBe('21/10/2026 16:25;#1001;Paga;69,90;84,90;MARIA;"Maria; Silva";cupom de creator MARIA;6,99');
    expect(lines[2]).toBe("21/10/2026 16:30;#1002;Aguardando pagamento;1,00;1,00;;;sem cupom;");
  });
});

describe("período da tela de vendas", () => {
  const now = new Date("2026-10-22T15:00:00Z");
  it("padrão 30 dias; a lista segue o período; busca sem período procura em todas as datas", async () => {
    const { filtersOf, salesPeriod } = await import("@/app/admin/vendas/filters");
    const p = salesPeriod({}, "America/Sao_Paulo", now);
    expect(p).toEqual({ from: "2026-09-23", to: "2026-10-22", preset: "30" });
    expect(filtersOf({}, p)).toMatchObject({ from: "2026-09-23", to: "2026-10-22" });
    expect(filtersOf({ q: "#1001" }, p)).toMatchObject({ q: "#1001", from: "", to: "" });
    expect(filtersOf({ q: "#1001", periodo: "7" }, salesPeriod({ periodo: "7" }, "America/Sao_Paulo", now))).toMatchObject({ from: "2026-10-16", to: "2026-10-22" });
    const custom = salesPeriod({ de: "2026-08-01", ate: "2026-08-31" }, "America/Sao_Paulo", now);
    expect(custom).toEqual({ from: "2026-08-01", to: "2026-08-31", preset: "" });
    expect(filtersOf({ de: "2026-08-01", ate: "2026-08-31", situacao: "PAID", dona: "sem" }, custom)).toEqual({ q: "", status: "PAID", owner: "none", from: "2026-08-01", to: "2026-08-31" });
  });
});
