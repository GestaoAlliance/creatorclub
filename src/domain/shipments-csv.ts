import { dayKey } from "./time";

/**
 * Planilha dos envios (D-SHIPCSV): uma linha por envio, com creator e contato, endereço, produtos e custo, situação
 * e rastreio. Mesmo formato do CSV de vendas (separador ";", BOM para o Excel ler os acentos, valores com vírgula).
 */

export type ShipmentCsvRow = {
  createdAt: Date;
  status: string;
  kind: string;
  creator: string;
  instagram: string | null;
  doc: string | null;
  phone: string | null;
  email: string | null;
  address: { zip: string; street: string; number: string; complement: string | null; district: string; city: string; state: string } | { raw: string } | null;
  items: readonly { title: string; quantity: number; unitCostCents: number | null }[];
  freightCents: number | null;
  carrier: string | null;
  trackingCode: string | null;
  shippedAt: Date | null;
  deliveredAt: Date | null;
};

const STATUS: Record<string, string> = { AWAITING_APPROVAL: "Aguardando aprovação", PREPARING: "Preparando", SHIPPED: "Enviado", DELIVERED: "Entregue", CANCELLED: "Cancelado" };

/** Tipo do envio: kit (boas-vindas, meta, mês), compra com o saldo ou envio avulso da equipe. */
export function shipmentKind(kitKind: string | null, balanceCents: number | null): string {
  if (kitKind === "WELCOME") return "Boas-vindas";
  if (kitKind === "GOAL") return "Meta de vendas";
  if (kitKind === "MONTHLY") return "Kit do mês";
  if (kitKind) return "Kit";
  if (balanceCents !== null) return "Loja (saldo)";
  return "Avulso (equipe)";
}

function cell(v: string | number | null): string {
  const s = v === null ? "" : String(v);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
const money = (cents: number | null) => (cents === null ? "" : (cents / 100).toFixed(2).replace(".", ","));
const day = (d: Date | null) => (d ? dayKey(d).split("-").reverse().join("/") : "");

export function shipmentsCsv(rows: readonly ShipmentCsvRow[], now = new Date()): string {
  const head = [
    "Data do pedido", "Situação", "Tipo", "Creator", "Instagram", "CPF/CNPJ", "Telefone", "E-mail",
    "CEP", "Rua", "Número", "Complemento", "Bairro", "Cidade", "UF",
    "Produtos", "Qtd. de produtos", "Custo (R$)", "Frete (R$)", "Transportadora", "Rastreio", "Enviado em", "Entregue em", "Dias desde o pedido",
  ];
  const lines = rows.map((r) => {
    const a = r.address && "zip" in r.address ? r.address : null;
    const raw = r.address && "raw" in r.address ? r.address.raw : null;
    const priced = r.items.length > 0 && r.items.every((i) => i.unitCostCents !== null);
    const cost = priced ? r.items.reduce((s, i) => s + i.quantity * (i.unitCostCents ?? 0), 0) : null;
    return [
      day(r.createdAt), STATUS[r.status] ?? r.status, r.kind, r.creator, r.instagram ? `@${r.instagram.replace(/^@/, "")}` : null, r.doc, r.phone, r.email,
      a?.zip ?? null, a?.street ?? raw, a?.number ?? null, a?.complement ?? null, a?.district ?? null, a?.city ?? null, a?.state ?? null,
      r.items.map((i) => `${i.quantity}x ${i.title}`).join("; "), r.items.reduce((s, i) => s + i.quantity, 0), money(cost), money(r.freightCents),
      r.carrier, r.trackingCode, day(r.shippedAt), day(r.deliveredAt), Math.max(0, Math.floor((now.getTime() - r.createdAt.getTime()) / 86_400_000)),
    ].map(cell).join(";");
  });
  return `﻿${[head.join(";"), ...lines].join("\r\n")}\r\n`;
}
