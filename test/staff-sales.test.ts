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
