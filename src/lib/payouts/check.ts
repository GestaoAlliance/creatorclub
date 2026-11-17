import type { PrismaClient } from "@/generated/prisma/client";
import { computeBalance, formatBRL, isUgcOnly, monthKey, monthNamePt, nextMonthKey, nfBreakdown, previousMonthKey, startOfLocalDay, type NfLine } from "@/domain";
import type { Actor } from "@/lib/auth/actor";
import { can } from "@/lib/auth/permissions";
import { ledgerEntriesWithMonth, openReservations, releasedThroughFor, salesByMonth } from "@/lib/commission/release";
import { diffFromLines, type PayKind } from "./month-board";

/**
 * D-PAYCHECK (passo 1 da Vanessa, 2026-11-17): antes de liberar o saque, a equipe confere se o valor a receber no
 * Creator Club bate com as vendas do mês × % de comissão. Bate quando a diferença é de até R$ 1,00 (a comissão é
 * arredondada pedido a pedido). Conferido grava quem, quando e o valor; aprovar o saque exige o último registro da
 * creator no mês conferido e com o mesmo valor. Não bateu: vai para análise (texto pronto para o grupo).
 */

export class PayCheckError extends Error {}

export const MATCH_TOLERANCE_CENTS = 100;

export type CheckState = { status: "CHECKED" | "REVIEW"; amountCents: number; at: Date; by: string | null; note: string | null; stale: boolean };

export type CheckRow = {
  creatorId: string;
  name: string;
  phone: string | null;
  /** Sem chave Pix cadastrada: o pagamento não sai até ela informar (no pedido de saque). */
  hasPix: boolean;
  month: string;
  salesCents: number;
  rateBps: number | null;
  /** Vendas do mês × % (null sem taxa). */
  expectedCents: number | null;
  /** Comissão lançada no mês (comissões menos estornos). */
  commissionCents: number;
  /** O valor no Creator Club: o saque pedido, ou o disponível para a nota. */
  systemCents: number;
  withdrawal: { id: string; status: "REQUESTED" | "APPROVED" } | null;
  matches: boolean;
  /** Por que o valor no sistema é diferente do esperado. */
  reasons: { label: string; cents: number }[];
  check: CheckState | null;
};

const ORDER = new Set(["COMMISSION", "REVERSAL"]);

export const expectedOf = (salesCents: number, rateBps: number | null) => (rateBps === null ? null : Math.round((salesCents * rateBps) / 10_000));
export const isMatch = (systemCents: number, expectedCents: number | null) => expectedCents !== null && Math.abs(systemCents - expectedCents) <= MATCH_TOLERANCE_CENTS;

/** As linhas da conferência (ou só de algumas creators), no mês da nota da janela (o último mês fechado). */
export async function payCheckRows(prisma: PrismaClient, brandId: string, kind: PayKind | null, now = new Date(), only?: string[]): Promise<{ month: string; rows: CheckRow[] }> {
  const brand = await prisma.brand.findUniqueOrThrow({ where: { id: brandId }, select: { timezone: true } });
  const tz = brand.timezone;
  const lastClosed = previousMonthKey(monthKey(now, tz));
  const creators = await prisma.creator.findMany({
    where: { brandId, archivedAt: null, ...(kind ? { receivesAsIndividual: kind === "CPF" } : {}), ...(only ? { id: { in: only } } : {}) },
    select: { id: true, categories: true, account: { select: { name: true, phone: true, pixKey: true } } },
  });
  const list = creators.filter((c) => !isUgcOnly(c.categories));
  const ids = list.map((c) => c.id);
  if (ids.length === 0) return { month: lastClosed, rows: [] };
  const [entries, open, released, sales, policies, withdrawals, checks] = await Promise.all([
    ledgerEntriesWithMonth(prisma, ids, tz),
    openReservations(prisma, { creatorId: { in: ids } }),
    releasedThroughFor(prisma, ids),
    salesByMonth(prisma, ids, tz),
    prisma.commissionPolicy.findMany({ where: { creatorId: { in: ids }, confirmedAt: { not: null } }, orderBy: { validFrom: "desc" }, select: { creatorId: true, rateBps: true, validFrom: true, validTo: true } }),
    prisma.withdrawal.findMany({ where: { creatorId: { in: ids }, status: { in: ["REQUESTED", "APPROVED"] } }, orderBy: { requestedAt: "asc" }, select: { id: true, creatorId: true, status: true, amountCents: true, referenceMonth: true, breakdown: true } }),
    prisma.payoutCheck.findMany({ where: { creatorId: { in: ids } }, orderBy: { createdAt: "desc" }, select: { creatorId: true, month: true, status: true, amountCents: true, createdAt: true, createdById: true, note: true } }),
  ]);
  const users = new Map(
    (await prisma.user.findMany({ where: { id: { in: [...new Set(checks.map((c) => c.createdById))] } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]),
  );
  const rateOf = (id: string, m: string) => {
    const start = startOfLocalDay(`${m}-01`, tz);
    const end = startOfLocalDay(`${nextMonthKey(m)}-01`, tz);
    return policies.find((p) => p.creatorId === id && p.validFrom < end && (!p.validTo || p.validTo >= start))?.rateBps ?? null;
  };

  const rows: CheckRow[] = [];
  for (const c of list) {
    const mine = entries.filter((e) => e.creatorId === c.id);
    const w = withdrawals.find((x) => x.creatorId === c.id) ?? null;
    const month = w?.referenceMonth ?? lastClosed;
    let systemCents: number;
    let lines: NfLine[];
    if (w) {
      systemCents = w.amountCents;
      lines = Array.isArray(w.breakdown) ? (w.breakdown as unknown as NfLine[]) : [];
    } else {
      const through = released.get(c.id) ?? null;
      const reserved = open.filter((o) => o.creatorId === c.id);
      const balance = computeBalance(mine, reserved, now, { releasedThrough: through });
      if (balance.availableCents <= 0) continue;
      systemCents = balance.availableCents;
      const nf = nfBreakdown(
        mine.map((e) => ({ type: e.type, amountCents: e.amountCents, month: e.month!, held: !ORDER.has(e.type) && e.amountCents > 0 && e.availableAt > now })),
        through,
        reserved.reduce((t, o) => t + o.amountCents, 0),
        balance.availableCents,
      );
      lines = nf.lines.filter((l) => l.key !== "RESERVED");
    }
    const salesCents = sales.get(c.id)?.get(month) ?? 0;
    const rateBps = rateOf(c.id, month);
    const expectedCents = expectedOf(salesCents, rateBps);
    const commissionCents = mine.filter((e) => e.month === month && ORDER.has(e.type)).reduce((t, e) => t + e.amountCents, 0);
    const reasons = diffFromLines(lines, month);
    if (expectedCents !== null && Math.abs(commissionCents - expectedCents) > MATCH_TOLERANCE_CENTS) {
      reasons.unshift({ label: `comissão lançada em ${monthNamePt(month)} é diferente de vendas × % (estorno, pedido com outro cupom antes ou taxa diferente no mês)`, cents: commissionCents - expectedCents });
    }
    const last = checks.find((k) => k.creatorId === c.id && k.month === month) ?? null;
    rows.push({
      creatorId: c.id,
      name: c.account.name,
      phone: c.account.phone,
      hasPix: Boolean(c.account.pixKey?.trim()),
      month,
      salesCents,
      rateBps,
      expectedCents,
      commissionCents,
      systemCents,
      withdrawal: w ? { id: w.id, status: w.status as "REQUESTED" | "APPROVED" } : null,
      matches: isMatch(systemCents, expectedCents),
      reasons,
      check: last ? { status: last.status, amountCents: last.amountCents, at: last.createdAt, by: users.get(last.createdById) ?? null, note: last.note, stale: last.amountCents !== systemCents } : null,
    });
  }
  // Primeiro o que falta conferir (não bate antes), depois em análise, por último os conferidos.
  const rank = (r: CheckRow) => (r.check?.status === "CHECKED" && !r.check.stale ? 3 : r.check?.status === "REVIEW" ? 2 : r.matches ? 1 : 0);
  rows.sort((a, b) => rank(a) - rank(b) || b.systemCents - a.systemCents);
  return { month: lastClosed, rows };
}

export async function payCheckBoard(prisma: PrismaClient, actor: Actor | null, brandId: string, kind: PayKind, now = new Date()) {
  if (!actor || !can(actor.grants, "withdrawals.view", brandId)) throw new PayCheckError("Sem permissão para pagamentos.");
  const r = await payCheckRows(prisma, brandId, kind, now);
  const done = r.rows.filter((x) => x.check?.status === "CHECKED" && !x.check.stale);
  return {
    ...r,
    counts: {
      todo: r.rows.length - done.length - r.rows.filter((x) => x.check?.status === "REVIEW" && !x.check.stale).length,
      review: r.rows.filter((x) => x.check?.status === "REVIEW" && !x.check.stale).length,
      done: done.length,
      cents: r.rows.reduce((t, x) => t + x.systemCents, 0),
    },
  };
}

/** Texto para o grupo quando o valor não bate (WhatsApp). */
export function reviewText(r: CheckRow, brandName: string): string {
  const pct = r.rateBps === null ? "sem taxa" : `${(r.rateBps / 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
  const lines = [
    `*Conferência de saque · ${brandName}*`,
    `*${r.name}* · comissão de ${monthNamePt(r.month)}`,
    `Vendas de ${monthNamePt(r.month)}: ${formatBRL(r.salesCents)} × ${pct} = *${r.expectedCents === null ? "—" : formatBRL(r.expectedCents)}*`,
    `No Creator Club: *${formatBRL(r.systemCents)}*${r.withdrawal ? " (saque pedido)" : ""}`,
    `Diferença: ${r.expectedCents === null ? "—" : formatBRL(r.systemCents - r.expectedCents)}`,
  ];
  if (r.reasons.length) lines.push("", "_O que o sistema mostra:_", ...r.reasons.map((x) => `• ${x.label}: ${x.cents < 0 ? "−" : "+"} ${formatBRL(Math.abs(x.cents))}`));
  lines.push("", "Pode analisar por que está diferente?");
  return lines.join("\n");
}

/** Conferido ou mandado para análise. O valor é recalculado aqui (não vem da tela). */
export async function recordPayCheck(prisma: PrismaClient, actor: Actor | null, creatorId: string, status: "CHECKED" | "REVIEW", note: string | null, now = new Date()) {
  const c = await prisma.creator.findUnique({ where: { id: creatorId }, select: { brandId: true } });
  if (!c) throw new PayCheckError("Creator não encontrada.");
  if (!actor || !can(actor.grants, "withdrawals.approve", c.brandId)) throw new PayCheckError("Só quem aprova saques confere.");
  const { rows } = await payCheckRows(prisma, c.brandId, null, now, [creatorId]);
  const r = rows[0];
  if (!r) throw new PayCheckError("Nada a receber para conferir agora.");
  if (status === "CHECKED" && r.expectedCents === null) throw new PayCheckError("Sem taxa de comissão confirmada no mês: confirme a taxa antes de conferir.");
  // Clique duplo (ou repetido): o mesmo registro que já vale não grava de novo.
  if (r.check && !r.check.stale && r.check.status === status) return r;
  await prisma.$transaction([
    prisma.payoutCheck.create({
      data: { brandId: c.brandId, creatorId, month: r.month, status, amountCents: r.systemCents, expectedCents: r.expectedCents ?? 0, note: note?.trim().slice(0, 2000) || null, createdById: actor.userId, createdAt: now },
    }),
    prisma.auditLog.create({
      data: { brandId: c.brandId, actorType: "USER", actorId: actor.userId, action: status === "CHECKED" ? "payout.checked" : "payout.review", entity: "Creator", entityId: creatorId, after: { month: r.month, amountCents: r.systemCents, expectedCents: r.expectedCents } },
    }),
  ]);
  return r;
}

/** Trava da aprovação: o último registro da creator no mês do saque tem de ser "conferido" com o mesmo valor. */
export async function assertPayChecked(prisma: Pick<PrismaClient, "payoutCheck">, w: { creatorId: string; amountCents: number; referenceMonth: string | null }) {
  const last = await prisma.payoutCheck.findFirst({
    where: { creatorId: w.creatorId, ...(w.referenceMonth ? { month: w.referenceMonth } : {}) },
    orderBy: { createdAt: "desc" },
    select: { status: true, amountCents: true },
  });
  if (!last || last.status !== "CHECKED") throw new PayCheckError("Confira o valor antes de aprovar: Pagamentos › 0. Conferir (vendas × % tem de bater com o valor do saque).");
  if (last.amountCents !== w.amountCents) throw new PayCheckError(`O valor conferido (${formatBRL(last.amountCents)}) é diferente do saque (${formatBRL(w.amountCents)}): confira de novo antes de aprovar.`);
}
