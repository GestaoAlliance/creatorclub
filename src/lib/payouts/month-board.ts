import type { PrismaClient } from "@/generated/prisma/client";
import { computeBalance, dayKey, isMonthKey, monthKey, monthNamePt, previousMonthKey, UNEXPLAINED, type NfLine } from "@/domain";
import type { Actor } from "@/lib/auth/actor";
import { can } from "@/lib/auth/permissions";
import { calendarOf } from "@/lib/brands/calendar";
import { ledgerEntriesWithMonth, nfSnapshot, openReservations, releasedThroughFor, salesByMonth } from "@/lib/commission/release";

/**
 * D-PAYFLOW: Pagamentos CNPJ e Pagamentos CPF, mês a mês pelo mês da comissão (referência). Três abas:
 * NF para aprovar (pedidos em análise + quem ainda não enviou), Saques a realizar (aprovados) e Saques realizados
 * (pagos + os Pix de antes do Creator Club, pelo mês do Pix). Cada linha: nome completo, vendas do mês, % de comissão,
 * comissão do mês e valor da nota, com o motivo quando a nota é diferente da comissão do mês.
 */

export class PayFlowError extends Error {}

export type PayKind = "CNPJ" | "CPF";
export type PayTab = "aprovar" | "realizar" | "realizados";

export type PayRow = {
  key: string;
  withdrawalId: string | null;
  creatorId: string;
  name: string;
  document: string | null;
  pixKey: string | null;
  salesCents: number;
  rateBps: number | null;
  commissionCents: number;
  nfCents: number;
  /** Por que a nota não é igual à comissão do mês (vazio = igual). */
  diff: { label: string; cents: number }[];
  requestedAt: Date | null;
  approvedAt: Date | null;
  paidAt: Date | null;
  paidDay: string | null;
  paidBy: string | null;
  pixReference: string | null;
  hasNf: boolean;
  nfCheck: "OK" | "MANUAL" | null;
  legacy: boolean;
  note: string | null;
  remittanceNsa: number | null;
  canApprove: boolean;
  canPay: boolean;
  /** D-NODOUBLEPAY: aprovado e no banco: só o retorno paga; "tirar da remessa" com confirmação. */
  inBank: boolean;
};

const ORDER_TYPES = new Set(["COMMISSION", "REVERSAL"]);

/** Explica a diferença entre a nota e a comissão do mês a partir das linhas da conta da nota. */
export function diffFromLines(lines: readonly NfLine[], month: string): { label: string; cents: number }[] {
  return lines
    .filter((l) => l.key !== `c:${month}` && l.key !== "RESERVED" && l.cents !== 0)
    .map((l) => ({ label: l.key.startsWith("c:") ? `comissão de ${monthNamePt(l.month!)}` : l.label.charAt(0).toLowerCase() + l.label.slice(1), cents: l.cents }));
}

export async function payMonthBoard(prisma: PrismaClient, actor: Actor | null, brandId: string, kind: PayKind, tab: PayTab, rawMonth: string | undefined, now = new Date()) {
  if (!actor || !can(actor.grants, "withdrawals.view", brandId)) throw new PayFlowError("Sem permissão para pagamentos.");
  const brand = await prisma.brand.findUniqueOrThrow({
    where: { id: brandId },
    select: { timezone: true, withdrawalWindowStartDay: true, withdrawalWindowEndDay: true, withdrawalPayFromDay: true, withdrawalPayByDay: true, windowExtensionMonth: true, windowNormalEndDay: true },
  });
  const tz = brand.timezone;
  const lastClosed = previousMonthKey(monthKey(now, tz));
  const month = rawMonth && isMonthKey(rawMonth) ? rawMonth : lastClosed;
  const fiscal = can(actor.grants, "personal.fiscal", brandId);
  const individual = kind === "CPF";
  const methods = individual ? (["RECEIPT_PIX", "ALELO"] as const) : (["NF_PIX"] as const);

  // Todos os pedidos do tipo, para os quadros (contagem por etapa no mês) e a lista de meses.
  const all = await prisma.withdrawal.findMany({
    where: { brandId, method: { in: [...methods] }, status: { in: ["REQUESTED", "APPROVED", "PAID"] } },
    select: { id: true, status: true, referenceMonth: true, amountCents: true },
  });
  const inMonth = all.filter((w) => w.referenceMonth === month);
  const stage = (s: string) => inMonth.filter((w) => w.status === s);
  const sum = (l: { amountCents: number }[]) => l.reduce((t, w) => t + w.amountCents, 0);

  const status = tab === "aprovar" ? "REQUESTED" : tab === "realizar" ? "APPROVED" : "PAID";
  const rows = await prisma.withdrawal.findMany({
    where: { brandId, method: { in: [...methods] }, status, referenceMonth: month },
    orderBy: status === "PAID" ? { decidedAt: "desc" } : { requestedAt: "asc" },
    select: {
      id: true, creatorId: true, amountCents: true, requestedAt: true, approvedAt: true, decidedAt: true, decidedById: true, pixReference: true,
      nfFileId: true, nfCheck: true, breakdown: true, remittance: { select: { nsa: true } },
      creator: { select: { account: { select: { name: true, cpf: true, cnpj: true, pixKey: true } } } },
    },
  });
  const legacy = tab === "realizados"
    ? await prisma.legacyPayout.findMany({
        where: { brandId, creator: { receivesAsIndividual: individual }, paidOn: { gte: new Date(`${month}-01T00:00:00Z`), lt: new Date(`${nextMonth(month)}-01T00:00:00Z`) } },
        orderBy: { paidOn: "desc" },
        select: { id: true, creatorId: true, amountCents: true, paidOn: true, note: true, creator: { select: { account: { select: { name: true, cpf: true, cnpj: true } } } } },
      })
    : [];

  // Quem tem saldo para a nota deste mês e ainda não pediu (só na aba de aprovar e no último mês liberado).
  const waitingCreators = tab === "aprovar"
    ? await prisma.creator.findMany({
        where: { brandId, archivedAt: null, status: { not: "DEACTIVATED" }, withdrawalsUnlockedAt: { not: null }, receivesAsIndividual: individual, NOT: { categories: { equals: ["UGC"] } } },
        select: { id: true, account: { select: { name: true, phone: true } } },
      })
    : [];

  const ids = [...new Set([...rows.map((r) => r.creatorId), ...waitingCreators.map((c) => c.id)])];
  const [entries, open, released, sales, policies, payers] = await Promise.all([
    ids.length ? ledgerEntriesWithMonth(prisma, ids, tz) : Promise.resolve([]),
    ids.length ? openReservations(prisma, { creatorId: { in: ids } }) : Promise.resolve([]),
    releasedThroughFor(prisma, ids),
    salesByMonth(prisma, ids, tz),
    prisma.commissionPolicy.findMany({ where: { creatorId: { in: ids }, confirmedAt: { not: null } }, orderBy: { validFrom: "desc" }, select: { creatorId: true, rateBps: true, validFrom: true, validTo: true } }),
    prisma.user.findMany({ where: { id: { in: rows.map((r) => r.decidedById).filter((x): x is string => Boolean(x)) } }, select: { id: true, name: true } }),
  ]);
  const monthEnd = new Date(`${nextMonth(month)}-01T03:00:00Z`);
  const rateOf = (id: string) => policies.find((p) => p.creatorId === id && p.validFrom < monthEnd && (!p.validTo || p.validTo >= new Date(`${month}-01T03:00:00Z`)))?.rateBps ?? null;
  const commissionOf = (id: string) => entries.filter((e) => e.creatorId === id && e.month === month && ORDER_TYPES.has(e.type)).reduce((t, e) => t + e.amountCents, 0);
  const doc = (a: { cpf: string | null; cnpj: string | null }) => (fiscal ? (individual ? (a.cpf ?? a.cnpj) : (a.cnpj ?? a.cpf)) : null);
  const payer = new Map(payers.map((u) => [u.id, u.name]));
  const day = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

  const out: PayRow[] = [];
  for (const r of rows) {
    const a = r.creator.account;
    const commissionCents = commissionOf(r.creatorId);
    let lines = Array.isArray(r.breakdown) ? (r.breakdown as unknown as NfLine[]) : null;
    if (!lines && status !== "PAID") {
      // Pedido de antes do D-PAYFLOW: a conta de agora, devolvendo o próprio pedido ao disponível.
      const snap = await nfSnapshot(prisma, { id: r.creatorId, brandId }, tz, now);
      lines = snap.lines.filter((l) => l.key !== "RESERVED" && l.key !== "OTHER");
    }
    const diff = lines ? diffFromLines(lines, month) : [];
    // A conta tem de fechar com o valor pedido; o que sobrar aparece como diferença sem explicação (para conferir).
    const rest = r.amountCents - commissionCents - diff.reduce((t, d) => t + d.cents, 0);
    if (rest !== 0) diff.push({ label: UNEXPLAINED, cents: rest });
    out.push({
      key: `w:${r.id}`, withdrawalId: r.id, creatorId: r.creatorId, name: a.name, document: doc(a), pixKey: fiscal ? a.pixKey : null,
      salesCents: sales.get(r.creatorId)?.get(month) ?? 0, rateBps: rateOf(r.creatorId), commissionCents, nfCents: r.amountCents, diff,
      requestedAt: r.requestedAt, approvedAt: r.approvedAt, paidAt: status === "PAID" ? r.decidedAt : null, paidDay: status === "PAID" && r.decidedAt ? day(r.decidedAt) : null,
      paidBy: r.decidedById ? (payer.get(r.decidedById) ?? null) : null, pixReference: r.pixReference, hasNf: r.nfFileId !== null, nfCheck: r.nfCheck,
      legacy: false, note: null, remittanceNsa: r.remittance?.nsa ?? null,
      canApprove: status === "REQUESTED" && can(actor.grants, "withdrawals.approve", brandId),
      // D-NODOUBLEPAY: no banco (remessa) = pago pelo retorno, não pelo botão.
      canPay: status === "APPROVED" && !r.remittance && can(actor.grants, "withdrawals.manage", brandId),
      inBank: status === "APPROVED" && r.remittance !== null && can(actor.grants, "withdrawals.manage", brandId),
    });
  }
  for (const l of legacy) {
    out.push({
      key: `l:${l.id}`, withdrawalId: null, creatorId: l.creatorId, name: l.creator.account.name, document: doc(l.creator.account), pixKey: null,
      salesCents: 0, rateBps: null, commissionCents: 0, nfCents: l.amountCents, diff: [], requestedAt: null, approvedAt: null, paidAt: null,
      paidDay: l.paidOn.toISOString().slice(0, 10), paidBy: null, pixReference: null, hasNf: false, nfCheck: null, legacy: true, note: l.note,
      remittanceNsa: null, canApprove: false, canPay: false, inBank: false,
    });
  }

  // Só no mês da nota da janela (o último mês fechado): nos meses antigos, quem não pediu já entra na nota seguinte.
  const waiting = month !== lastClosed ? [] : waitingCreators
    .filter((c) => !open.some((o) => o.creatorId === c.id))
    .map((c) => {
      const b = computeBalance(entries.filter((e) => e.creatorId === c.id), [], now, { releasedThrough: released.get(c.id) ?? null });
      return { id: c.id, name: c.account.name, phone: c.account.phone, nfCents: b.availableCents, commissionCents: commissionOf(c.id) };
    })
    .filter((c) => c.nfCents > 0)
    .sort((x, y) => y.nfCents - x.nfCents);

  const months = [...new Set([lastClosed, month, ...all.map((w) => w.referenceMonth).filter((m): m is string => Boolean(m))])].sort().reverse();
  return {
    month,
    months,
    rows: out,
    waiting,
    window: { start: brand.withdrawalWindowStartDay, end: brand.withdrawalWindowEndDay },
    // D-CALENDAR: o mês corrente com os marcos e "hoje".
    calendar: { month: monthKey(now, tz), today: Number(dayKey(now, tz).slice(8, 10)), ...calendarOf(brand, now) },
    stages: {
      aprovar: { count: stage("REQUESTED").length, cents: sum(stage("REQUESTED")), waiting: waiting.length },
      realizar: { count: stage("APPROVED").length, cents: sum(stage("APPROVED")) },
      realizados: { count: stage("PAID").length, cents: sum(stage("PAID")) },
    },
    totals: { nfCents: out.reduce((t, r) => t + r.nfCents, 0), commissionCents: out.reduce((t, r) => t + r.commissionCents, 0), salesCents: out.reduce((t, r) => t + r.salesCents, 0) },
  };
}

function nextMonth(m: string) {
  const [y, mm] = m.split("-").map(Number) as [number, number];
  return mm === 12 ? `${y + 1}-01` : `${y}-${String(mm + 1).padStart(2, "0")}`;
}

/** Planilha das linhas (BOM para o Excel, `;`, valores com vírgula, total no fim). */
export function payRowsCsv(rows: readonly PayRow[], brandName: string, month: string): string {
  const cell = (v: string | null) => {
    let s = v ?? "";
    if (/^[=+\-@]/.test(s)) s = `'${s}`;
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const brl = (c: number) => (c / 100).toFixed(2).replace(".", ",");
  const day = (d: Date | null) => (d ? d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : null);
  const br = (d: string | null) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : null);
  const head = ["Marca", "Mês da comissão", "Nome completo", "CPF/CNPJ", "Chave Pix", "Valor vendido (R$)", "% comissão", "Comissão do mês (R$)", "Valor da nota (R$)", "Diferença", "Pedido em", "Aprovado em", "Pago em", "Pago por", "ID do Pix", "Observação"];
  const lines = rows.map((r) =>
    [
      brandName, `${month.slice(5)}/${month.slice(0, 4)}`, r.name, r.document, r.pixKey, r.legacy ? null : brl(r.salesCents), r.rateBps === null ? null : `${(r.rateBps / 100).toString().replace(".", ",")}%`,
      r.legacy ? null : brl(r.commissionCents), brl(r.nfCents), r.diff.map((d) => `${d.label}: ${d.cents < 0 ? "menos" : "mais"} ${brl(Math.abs(d.cents))}`).join(" | ") || null,
      day(r.requestedAt), day(r.approvedAt), br(r.paidDay), r.paidBy, r.pixReference, r.legacy ? `antes do Creator Club: ${r.note ?? ""}` : null,
    ].map(cell).join(";"),
  );
  const total = ["Total", "", `${rows.length} ${rows.length === 1 ? "linha" : "linhas"}`, "", "", brl(rows.reduce((s, r) => s + r.salesCents, 0)), "", brl(rows.reduce((s, r) => s + r.commissionCents, 0)), brl(rows.reduce((s, r) => s + r.nfCents, 0)), "", "", "", "", "", "", ""].join(";");
  return `﻿${[head.join(";"), ...lines, total].join("\r\n")}\r\n`;
}
