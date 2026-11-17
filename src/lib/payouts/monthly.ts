import type { PrismaClient } from "@/generated/prisma/client";
import { computeBalance, monthKey, nextMonthKey, previousMonthKey, startOfLocalDay } from "@/domain";
import type { Actor } from "@/lib/auth/actor";
import { can } from "@/lib/auth/permissions";
import { ledgerEntriesWithMonth, releasedThroughFor, salesByMonth } from "@/lib/commission/release";
import type { PayKind } from "./month-board";

/**
 * D-PERIODPICK: o quadro "Mês a mês" de Pagamentos e do Início. Por mês:
 * - vendido: vendas das creators pagas no mês (D-MONTH);
 * - gerada: comissão dessas vendas (comissões menos estornos);
 * - liberada: a parte da gerada de quem já teve o mês liberado no fechamento (D-CONTRACT);
 * - paga: Pix que saíram no mês (data do Pix), com os de antes do Creator Club;
 * - a pagar: comissão liberada daquele mês que ainda não virou Pix.
 *
 * "A pagar" por mês: o que cada creator ainda tem a receber (saldo liberado, contando o que já pediu e não recebeu) é
 * distribuído do mês liberado mais novo para o mais antigo, até a liberada de cada mês (os Pix pagam primeiro os meses
 * mais antigos). O total bate com o saldo a receber das creators. Saldo negativo não entra (D-NEG).
 */

export type MonthLine = { month: string; salesCents: number; commissionCents: number; releasedCents: number; paidCents: number; toPayCents: number };

const ORDER_TYPES = new Set(["COMMISSION", "REVERSAL"]);

/** Os meses do quadro: os do ano (com "Ano") ou os 12 até o fim do período. */
export function monthlyRange(period: { to: string; key?: string }): string[] {
  const end = period.to.slice(0, 7);
  const start = period.key?.startsWith("y:") ? `${end.slice(0, 4)}-01` : Array.from({ length: 11 }).reduce<string>((m) => previousMonthKey(m), end);
  const out: string[] = [];
  for (let m = start; m <= end; m = nextMonthKey(m)) out.push(m);
  return out;
}

/** Espalha o que a creator ainda tem a receber pelos meses liberados, do mais novo para o mais antigo. */
export function spreadOwed(owedCents: number, releasedByMonth: ReadonlyMap<string, number>): Map<string, number> {
  const out = new Map<string, number>();
  let left = Math.max(0, owedCents);
  const months = [...releasedByMonth.keys()].sort().reverse();
  for (const m of months) {
    if (left <= 0) break;
    const take = Math.min(left, Math.max(0, releasedByMonth.get(m)!));
    if (take > 0) out.set(m, take);
    left -= take;
  }
  // Sobra (bônus e ajustes fora de comissão): fica no mês liberado mais novo.
  if (left > 0 && months[0]) out.set(months[0], (out.get(months[0]) ?? 0) + left);
  return out;
}

export async function payMonthly(prisma: PrismaClient, actor: Actor | null, brandId: string, kind: PayKind | null, months: readonly string[], now = new Date()) {
  if (!actor || !can(actor.grants, "withdrawals.view", brandId)) return null;
  const brand = await prisma.brand.findUniqueOrThrow({ where: { id: brandId }, select: { timezone: true } });
  const tz = brand.timezone;
  const creatorWhere = { brandId, ...(kind ? { receivesAsIndividual: kind === "CPF" } : {}) };
  const methods = kind === "CPF" ? ["RECEIPT_PIX", "ALELO"] : kind === "CNPJ" ? ["NF_PIX"] : null;
  const first = months[0]!;
  const after = nextMonthKey(months[months.length - 1]!);
  const ids = (await prisma.creator.findMany({ where: creatorWhere, select: { id: true } })).map((c) => c.id);
  const [sales, entries, released, paid, legacy] = await Promise.all([
    salesByMonth(prisma, ids, tz),
    ledgerEntriesWithMonth(prisma, ids, tz),
    releasedThroughFor(prisma, ids),
    prisma.withdrawal.findMany({
      where: { brandId, status: "PAID", ...(methods ? { method: { in: methods as never } } : {}), decidedAt: { gte: startOfLocalDay(`${first}-01`, tz), lt: startOfLocalDay(`${after}-01`, tz) } },
      select: { amountCents: true, decidedAt: true },
    }),
    prisma.legacyPayout.findMany({
      where: { brandId, creator: creatorWhere, paidOn: { gte: new Date(`${first}-01T00:00:00Z`), lt: new Date(`${after}-01T00:00:00Z`) } },
      select: { amountCents: true, paidOn: true },
    }),
  ]);

  const line = new Map<string, MonthLine>(months.map((m) => [m, { month: m, salesCents: 0, commissionCents: 0, releasedCents: 0, paidCents: 0, toPayCents: 0 }]));
  for (const [, byMonth] of sales) for (const [m, c] of byMonth) { const l = line.get(m); if (l) l.salesCents += c; }
  for (const w of paid) { const l = line.get(monthKey(w.decidedAt!, tz)); if (l) l.paidCents += w.amountCents; }
  for (const p of legacy) { const l = line.get(p.paidOn.toISOString().slice(0, 7)); if (l) l.paidCents += p.amountCents; }

  let owedTotal = 0;
  let owedBefore = 0;
  const byCreator = new Map<string, typeof entries>();
  for (const e of entries) byCreator.set(e.creatorId, [...(byCreator.get(e.creatorId) ?? []), e]);
  for (const id of ids) {
    const mine = byCreator.get(id) ?? [];
    const through = released.get(id) ?? null;
    const releasedByMonth = new Map<string, number>();
    for (const e of mine) {
      if (!ORDER_TYPES.has(e.type) || !e.month) continue;
      const l = line.get(e.month);
      if (l) l.commissionCents += e.amountCents;
      if (through && e.month <= through) {
        if (l) l.releasedCents += e.amountCents;
        releasedByMonth.set(e.month, (releasedByMonth.get(e.month) ?? 0) + e.amountCents);
      }
    }
    // A receber = saldo liberado sem descontar os pedidos ainda não pagos (eles ainda não viraram Pix).
    const owed = computeBalance(mine, [], now, { releasedThrough: through }).availableCents;
    if (owed <= 0) continue;
    owedTotal += owed;
    for (const [m, c] of spreadOwed(owed, releasedByMonth)) {
      const l = line.get(m);
      if (l) l.toPayCents += c;
      else if (m < first) owedBefore += c;
    }
  }

  const lines = [...line.values()];
  const sum = (k: keyof Omit<MonthLine, "month">) => lines.reduce((t, l) => t + l[k], 0);
  return {
    lines,
    totals: { salesCents: sum("salesCents"), commissionCents: sum("commissionCents"), releasedCents: sum("releasedCents"), paidCents: sum("paidCents"), toPayCents: sum("toPayCents") },
    /** Tudo o que as creators ainda têm a receber (de qualquer mês) e a parte de meses antes do quadro. */
    owedTotal,
    owedBefore,
  };
}
