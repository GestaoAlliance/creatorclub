/**
 * Vendas na tela da equipe (M0.1). Regras puras: em que situação a venda está e por que ela foi (ou não) para uma
 * creator. A situação segue a mesma régua da comissão: só paga (ou parcialmente estornada), não cancelada e não teste
 * gera comissão.
 */

export type SaleStatus = "PAID" | "PENDING" | "REFUNDED" | "CANCELLED" | "TEST";

export const SALE_STATUSES: readonly SaleStatus[] = ["PAID", "PENDING", "REFUNDED", "CANCELLED", "TEST"];

export const SALE_STATUS_LABEL: Record<SaleStatus, string> = {
  PAID: "Paga",
  PENDING: "Aguardando pagamento",
  REFUNDED: "Estornada",
  CANCELLED: "Cancelada",
  TEST: "Teste",
};

/** Situações da Shopify (displayFinancialStatus) em cada grupo. O que não está aqui conta como aguardando. */
export const PAID_FINANCIAL = ["PAID", "PARTIALLY_REFUNDED"] as const;
export const REFUNDED_FINANCIAL = ["REFUNDED", "VOIDED", "EXPIRED"] as const;

export function saleStatus(o: { financialStatus: string; cancelledAt: Date | null; test: boolean }): SaleStatus {
  if (o.test) return "TEST";
  if (o.cancelledAt) return "CANCELLED";
  if ((PAID_FINANCIAL as readonly string[]).includes(o.financialStatus)) return "PAID";
  if ((REFUNDED_FINANCIAL as readonly string[]).includes(o.financialStatus)) return "REFUNDED";
  return "PENDING";
}

/** Cupom do pedido como o sistema o conhece (null = o código não está cadastrado na marca). */
export type SaleCoupon = { code: string; kind: "CREATOR" | "PROMO" | null } | null;

/**
 * Por que a venda está (ou não) com uma creator, em uma frase para a equipe. Com dona: o cupom que levou. Sem dona:
 * o motivo do primeiro cupom que explica (PROMO nunca atribui; cupom sem tipo espera a Ana; cupom de creator sem dona
 * na data; código fora do sistema).
 */
export function saleReason(p: { creatorCoupon: string | null; codes: readonly string[]; coupons: readonly SaleCoupon[] }): string {
  if (p.creatorCoupon) return `cupom de creator ${p.creatorCoupon}`;
  if (p.codes.length === 0) return "sem cupom";
  const known = p.coupons.filter((c): c is NonNullable<SaleCoupon> => c !== null);
  if (known.some((c) => c.kind === null)) return "cupom ainda sem tipo (a Ana classifica em Cupons)";
  if (known.some((c) => c.kind === "CREATOR")) return "cupom de creator sem dona na data da venda";
  if (known.length && known.every((c) => c.kind === "PROMO")) return "cupom da marca (PROMO): não vai para creator";
  return "cupom fora do sistema";
}

/** Uma célula de CSV (separador ";" para abrir direto no Excel em português). */
function cell(v: string | number | null): string {
  const s = v === null ? "" : String(v);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const money = (cents: number | null) => (cents === null ? "" : (cents / 100).toFixed(2).replace(".", ","));

export type SaleCsvRow = {
  date: string;
  order: string;
  status: SaleStatus;
  subtotalCents: number;
  totalCents: number;
  codes: readonly string[];
  creator: string | null;
  reason: string;
  commissionCents: number | null;
};

/** CSV das vendas: BOM para o Excel ler os acentos, valores com vírgula. */
export function salesCsv(rows: readonly SaleCsvRow[]): string {
  const head = ["Data", "Pedido", "Situação", "Produtos (R$)", "Total (R$)", "Cupons", "Creator", "Motivo", "Comissão (R$)"];
  const lines = rows.map((r) =>
    [r.date, r.order, SALE_STATUS_LABEL[r.status], money(r.subtotalCents), money(r.totalCents), r.codes.join(" "), r.creator, r.reason, money(r.commissionCents)]
      .map(cell)
      .join(";"),
  );
  return `﻿${[head.join(";"), ...lines].join("\r\n")}\r\n`;
}
