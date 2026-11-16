import type { PrismaClient } from "@/generated/prisma/client";
import { monthKey, nextMonthKey, startOfLocalDay } from "@/domain";
import type { Actor } from "@/lib/auth/actor";
import { can } from "@/lib/auth/permissions";

/**
 * D-PAIDLIST: aba "Pagos" de Pagamentos. O que foi pago no mês do pagamento (fuso da marca), para quem, quando, por
 * quem e com qual Pix; separado por CNPJ (nota) e CPF (recibo). Junta os pagamentos feitos antes do Creator Club
 * (`LegacyPayout`, marcados como "antes do sistema").
 */

export class PaidListError extends Error {}

export type PaidRow = {
  key: string;
  legacy: boolean;
  withdrawalId: string | null;
  creatorId: string;
  name: string;
  /** CNPJ = nota fiscal; CPF = pessoa física (recibo). */
  kind: "CNPJ" | "CPF";
  document: string | null;
  amountCents: number;
  requestedAt: Date | null;
  /** Dia do pagamento (AAAA-MM-DD, fuso da marca). */
  paidDay: string;
  paidBy: string | null;
  pixReference: string | null;
  hasNf: boolean;
  note: string | null;
};

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

export async function paidList(prisma: PrismaClient, actor: Actor | null, brandId: string, rawMonth: string | undefined, now = new Date()) {
  if (!actor || !can(actor.grants, "withdrawals.view", brandId)) throw new PaidListError("Sem permissão para saques.");
  const { timezone: tz } = await prisma.brand.findUniqueOrThrow({ where: { id: brandId }, select: { timezone: true } });
  const current = monthKey(now, tz);
  const month = rawMonth && MONTH.test(rawMonth) ? rawMonth : current;
  const from = startOfLocalDay(`${month}-01`, tz);
  const to = startOfLocalDay(`${nextMonthKey(month)}-01`, tz);
  const fiscal = can(actor.grants, "personal.fiscal", brandId);
  const account = { select: { name: true, cpf: true, cnpj: true } } as const;

  const [paid, legacy, paidMonths, legacyMonths] = await Promise.all([
    prisma.withdrawal.findMany({
      where: { brandId, status: "PAID", decidedAt: { gte: from, lt: to } },
      orderBy: { decidedAt: "desc" },
      select: { id: true, creatorId: true, amountCents: true, method: true, requestedAt: true, decidedAt: true, decidedById: true, pixReference: true, nfFileId: true, creator: { select: { account } } },
    }),
    prisma.legacyPayout.findMany({
      where: { brandId, paidOn: { gte: new Date(`${month}-01T00:00:00Z`), lt: new Date(`${nextMonthKey(month)}-01T00:00:00Z`) } },
      orderBy: { paidOn: "desc" },
      select: { id: true, creatorId: true, amountCents: true, paidOn: true, note: true, creator: { select: { receivesAsIndividual: true, account } } },
    }),
    prisma.withdrawal.findMany({ where: { brandId, status: "PAID", decidedAt: { not: null } }, select: { decidedAt: true } }),
    prisma.legacyPayout.findMany({ where: { brandId }, select: { paidOn: true } }),
  ]);
  const payers = new Map(
    (await prisma.user.findMany({ where: { id: { in: [...new Set(paid.map((w) => w.decidedById).filter((x): x is string => Boolean(x)))] } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]),
  );
  const doc = (a: { cpf: string | null; cnpj: string | null }, kind: "CNPJ" | "CPF") => (fiscal ? (kind === "CNPJ" ? (a.cnpj ?? a.cpf) : (a.cpf ?? a.cnpj)) : null);

  const rows: PaidRow[] = [
    ...paid.map((w): PaidRow => {
      const kind = w.method === "NF_PIX" ? "CNPJ" : "CPF";
      return {
        key: `w:${w.id}`, legacy: false, withdrawalId: w.id, creatorId: w.creatorId, name: w.creator.account.name, kind, document: doc(w.creator.account, kind), amountCents: w.amountCents,
        requestedAt: w.requestedAt, paidDay: dayIn(w.decidedAt!, tz), paidBy: w.decidedById ? (payers.get(w.decidedById) ?? null) : null, pixReference: w.pixReference, hasNf: w.nfFileId !== null, note: null,
      };
    }),
    ...legacy.map((l): PaidRow => {
      const kind = l.creator.receivesAsIndividual ? "CPF" : "CNPJ";
      return {
        key: `l:${l.id}`, legacy: true, withdrawalId: null, creatorId: l.creatorId, name: l.creator.account.name, kind, document: doc(l.creator.account, kind), amountCents: l.amountCents,
        requestedAt: null, paidDay: l.paidOn.toISOString().slice(0, 10), paidBy: null, pixReference: null, hasNf: false, note: l.note,
      };
    }),
  ].sort((a, b) => b.paidDay.localeCompare(a.paidDay) || a.name.localeCompare(b.name, "pt-BR"));

  const months = [...new Set([current, month, ...paidMonths.map((w) => monthKey(w.decidedAt!, tz)), ...legacyMonths.map((l) => l.paidOn.toISOString().slice(0, 7))])].sort().reverse();
  const total = (k?: "CNPJ" | "CPF") => {
    const list = k ? rows.filter((r) => r.kind === k) : rows;
    return { count: list.length, cents: list.reduce((s, r) => s + r.amountCents, 0) };
  };
  return { month, months, rows, totals: { all: total(), cnpj: total("CNPJ"), cpf: total("CPF"), legacy: { count: rows.filter((r) => r.legacy).length, cents: rows.filter((r) => r.legacy).reduce((s, r) => s + r.amountCents, 0) } } };
}

function dayIn(at: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
}

/** Planilha dos pagos do mês (BOM para o Excel, `;`, valor com vírgula, total no fim). */
export function paidCsv(rows: readonly PaidRow[], brandName: string): string {
  const cell = (v: string | null) => {
    let s = v ?? "";
    if (/^[=+\-@]/.test(s)) s = `'${s}`;
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const brl = (c: number) => (c / 100).toFixed(2).replace(".", ",");
  const br = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
  const reqDay = (d: Date | null) => (d ? d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : null);
  const head = ["Marca", "Creator", "Tipo", "CPF/CNPJ", "Valor (R$)", "Pedido em", "Pago em", "Pago por", "ID do Pix", "Origem", "Observação"];
  const lines = rows.map((r) =>
    [brandName, r.name, r.kind === "CNPJ" ? "CNPJ (nota)" : "CPF (recibo)", r.document, brl(r.amountCents), reqDay(r.requestedAt), br(r.paidDay), r.paidBy, r.pixReference, r.legacy ? "antes do Creator Club" : "Creator Club", r.note].map(cell).join(";"),
  );
  const total = ["Total", `${rows.length} ${rows.length === 1 ? "pagamento" : "pagamentos"}`, "", "", brl(rows.reduce((s, r) => s + r.amountCents, 0)), "", "", "", "", "", ""].join(";");
  return `﻿${[head.join(";"), ...lines, total].join("\r\n")}\r\n`;
}
