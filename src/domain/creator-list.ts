import { formatBRL } from "./money";
import type { Notice } from "./notices";

/**
 * Lista de creators da equipe (D-CREATORLIST, pedido do responsável em 2026-11-11): o que cada linha mostra de cara
 * (vendas dos últimos 30 dias, a tendência contra os 30 dias anteriores, as semanas em mini gráfico e a última venda
 * colorida), a planilha das marcadas e a mensagem da equipe para várias creators de uma vez. Regras puras (testadas).
 */

const DAY = 86_400_000;
/** Semanas no mini gráfico da linha (a mais antiga primeiro). */
export const LIST_WEEKS = 12;

/** Em quais das `LIST_WEEKS` semanas (0 = a mais antiga) cai a venda; null se é antes delas ou no futuro. */
export function weekIndex(paidAt: Date, now: Date, weeks = LIST_WEEKS): number | null {
  const ago = Math.floor((now.getTime() - paidAt.getTime()) / (7 * DAY));
  if (ago < 0 || ago >= weeks) return null;
  return weeks - 1 - ago;
}

export type Trend = { dir: "up" | "down" | "flat" | "new"; pct: number | null };

/**
 * Tendência dos últimos 30 dias contra os 30 anteriores. "new" = vendeu agora e nada antes; variação de até 10% conta
 * como estável (pouca venda oscila muito).
 */
export function trendOf(currentCents: number, previousCents: number): Trend {
  if (previousCents <= 0) return currentCents > 0 ? { dir: "new", pct: null } : { dir: "flat", pct: null };
  const pct = Math.round(((currentCents - previousCents) / previousCents) * 100);
  if (pct > 10) return { dir: "up", pct };
  if (pct < -10) return { dir: "down", pct };
  return { dir: "flat", pct };
}

export type SaleTone = "fresh" | "cooling" | "cold" | "never";

/** Cor da "última venda": até 15 dias verde, até 45 âmbar, mais que isso vermelho; nunca vendeu, cinza. */
export function lastSaleTone(daysAgo: number | null): SaleTone {
  if (daysAgo === null) return "never";
  if (daysAgo <= 15) return "fresh";
  if (daysAgo <= 45) return "cooling";
  return "cold";
}

/** "hoje", "ontem", "há 5 dias", "há 3 meses". */
export function agoText(daysAgo: number): string {
  if (daysAgo <= 0) return "hoje";
  if (daysAgo === 1) return "ontem";
  if (daysAgo < 60) return `há ${daysAgo} dias`;
  const months = Math.floor(daysAgo / 30);
  return months < 24 ? `há ${months} meses` : `há ${Math.floor(daysAgo / 365)} anos`;
}

export type CreatorCsvRow = {
  name: string;
  status: string;
  categories: string[];
  coupon: string | null;
  instagram: string | null;
  tiktok: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  state: string | null;
  tags: string[];
  /** Só para quem vê dinheiro. */
  stats: { salesCents: number; orders: number; sales30Cents: number } | null;
  lastSaleDay: string | null;
  joinedDay: string;
};

const cell = (v: string) => (/[;"\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
const money = (c: number) => (c / 100).toFixed(2).replace(".", ",");
const br = (day: string | null) => (day ? day.split("-").reverse().join("/") : "");

/** Planilha das creators marcadas (abre no Excel e no Google Planilhas: `;` e BOM, como as outras do sistema). */
export function creatorsCsv(rows: readonly CreatorCsvRow[]): string {
  const money$ = rows.some((r) => r.stats);
  const head = ["Nome", "Situação", "Tipo", "Cupom", "Instagram", "TikTok", "WhatsApp", "E-mail", "Cidade", "UF", "Tags", ...(money$ ? ["Vendas (R$)", "Vendas 30 dias (R$)", "Pedidos"] : []), "Última venda", "Entrada"];
  const lines = rows.map((r) =>
    [
      r.name,
      r.status,
      r.categories.join(", "),
      r.coupon ?? "",
      r.instagram ? `@${r.instagram.replace(/^@/, "")}` : "",
      r.tiktok ? `@${r.tiktok.replace(/^@/, "")}` : "",
      r.phone ?? "",
      r.email ?? "",
      r.city ?? "",
      r.state ?? "",
      r.tags.join(", "),
      ...(money$ ? [money(r.stats?.salesCents ?? 0), money(r.stats?.sales30Cents ?? 0), String(r.stats?.orders ?? 0)] : []),
      br(r.lastSaleDay),
      br(r.joinedDay),
    ]
      .map(cell)
      .join(";"),
  );
  return `﻿${[head.join(";"), ...lines].join("\r\n")}\r\n`;
}

export const TEAM_MESSAGE_MAX = { title: 80, body: 1000 } as const;

/** Primeiro nome, para a mensagem começar com "Oi, Maria". */
export const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? "";

/** `{nome}` na mensagem vira o primeiro nome da creator; `{cupom}`, o cupom dela. */
export function fillMessage(text: string, c: { name: string; coupon: string | null }): string {
  return text.replace(/\{nome\}/gi, firstName(c.name)).replace(/\{cupom\}/gi, c.coupon ?? "seu cupom");
}

/**
 * Mensagem da equipe (D-BULKMSG): vai para o portal (sininho), para o WhatsApp da marca quando ligado e, sem WhatsApp,
 * para o e-mail. A chave inclui o envio, para a mesma mensagem não repetir na mesma creator.
 */
export function teamMessage(sendId: string, title: string, body: string, path: string | null = null): Notice {
  return { kind: "TEAM_MESSAGE", dedupeKey: `team-message:${sendId}`, title: title.trim(), body: body.trim(), path };
}

/** Texto curto do valor para a linha ("R$ 1,2 mil"), o valor exato fica no título. */
export function shortBRL(cents: number): string {
  if (Math.abs(cents) < 1_000_00) return formatBRL(cents).replace(/,00$/, "");
  const k = cents / 100_000;
  return `R$\u00a0${k.toLocaleString("pt-BR", { maximumFractionDigits: k < 10 ? 1 : 0 })} mil`;
}
