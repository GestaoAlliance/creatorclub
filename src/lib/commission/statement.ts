import type { PrismaClient } from "@/generated/prisma/client";
import { computeBalance, entryMonth, isHeldByRelease, isMonthKey, monthKey, type Balance, type LedgerType } from "@/domain";
import type { Actor } from "@/lib/auth/actor";
import { can } from "@/lib/auth/permissions";
import { releaseProgress, releasedThroughFor, type ReleaseProgress } from "./release";

/**
 * Saldo e extrato da creator numa marca (E5.4). O saldo é a soma de todos os lançamentos (nunca cortado em zero,
 * D-NEG), separado em "a liberar" (comissão de mês ainda não liberado no fechamento, D-CONTRACT), "reservado" (saque
 * pedido) e "disponível".
 * O extrato é mostrado por mês: lançamento de pedido conta no mês do pagamento do pedido (D-MONTH).
 * Ver: `money.view` da marca. O portal da creator (E7) reaproveita esta leitura com o acesso dela.
 */

export class StatementError extends Error {}

export const LEDGER_LABEL: Record<LedgerType, string> = {
  COMMISSION: "Comissão",
  REVERSAL: "Estorno",
  WITHDRAWAL: "Saque",
  ADJUSTMENT: "Ajuste",
  OPENING_BALANCE: "Saldo de abertura",
};

export type StatementLine = {
  id: string;
  type: LedgerType;
  amountCents: number;
  createdAt: Date;
  availableAt: Date;
  held: boolean;
  orderName: string | null;
  orderPaidAt: Date | null;
  baseCents: number | null;
  rateBps: number | null;
  note: string | null;
};

export type Statement = {
  balance: Balance;
  /** Último mês com comissão liberada (D-CONTRACT); `null` = nenhum. */
  releasedThrough: string | null;
  /** Meses com lançamento, do mais recente ao mais antigo, com o total líquido de cada um. */
  months: { month: string; totalCents: number }[];
  month: string;
  lines: StatementLine[];
};

export type StatementLineWithMonth = StatementLine & { month: string };

/**
 * Lê o extrato inteiro de uma participação, sem checar acesso: quem chama já decidiu que pode (equipe com
 * `money.view` em `creatorStatement`; a própria creator no portal, E7).
 */
export async function readLedger(
  prisma: PrismaClient,
  creator: { id: string; brandId: string; brand: { timezone: string } },
  now: Date,
): Promise<Ledger> {
  const [entries, open, released] = await Promise.all([
    prisma.ledgerEntry.findMany({
      where: { creatorId: creator.id, brandId: creator.brandId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      include: { order: { select: { name: true, paidAt: true } } },
    }),
    prisma.withdrawal.findMany({ where: { creatorId: creator.id, brandId: creator.brandId, status: "REQUESTED" }, select: { amountCents: true } }),
    releasedThroughFor(prisma, [creator.id]),
  ]);
  const release = { releasedThrough: released.get(creator.id) ?? null };
  const lines = entries.map((e) => {
    const month = entryMonth({ createdAt: e.createdAt, orderPaidAt: e.order?.paidAt ?? null }, creator.brand.timezone);
    const line = { type: e.type, amountCents: e.amountCents, availableAt: e.availableAt, month };
    const isOrder = e.type === "COMMISSION" || e.type === "REVERSAL";
    return {
      id: e.id,
      type: e.type,
      amountCents: e.amountCents,
      createdAt: e.createdAt,
      availableAt: e.availableAt,
      held: e.amountCents > 0 && (isOrder ? isHeldByRelease(line, release) : e.availableAt > now),
      orderName: e.order?.name ?? null,
      orderPaidAt: e.order?.paidAt ?? null,
      baseCents: e.baseCents,
      rateBps: e.rateBps,
      note: e.note,
      month,
    };
  });
  return { balance: computeBalance(lines, open, now, release), lines, releasedThrough: release.releasedThrough };
}

export type Ledger = { balance: Balance; lines: StatementLineWithMonth[]; releasedThrough: string | null };

/** Extrato de um mês, com a lista de meses e o total líquido de cada um. */
export function statementForMonth(
  ledger: Ledger,
  month: string | undefined,
  fallbackMonth: string,
): Statement {
  const totals = new Map<string, number>();
  for (const l of ledger.lines) totals.set(l.month, (totals.get(l.month) ?? 0) + l.amountCents);
  const months = [...totals.entries()].sort(([a], [b]) => (a < b ? 1 : -1)).map(([m, totalCents]) => ({ month: m, totalCents }));
  const chosen = month ?? months[0]?.month ?? fallbackMonth;
  return {
    balance: ledger.balance,
    releasedThrough: ledger.releasedThrough,
    months,
    month: chosen,
    lines: ledger.lines
      .filter((l) => l.month === chosen)
      .sort((a, b) => (b.orderPaidAt ?? b.createdAt).getTime() - (a.orderPaidAt ?? a.createdAt).getTime())
      .map(({ month: _m, ...l }) => l),
  };
}

export async function creatorStatement(
  prisma: PrismaClient,
  actor: Actor | null,
  creatorId: string,
  opts: { month?: string; now?: Date } = {},
): Promise<Statement & { release: ReleaseProgress }> {
  const creator = await prisma.creator.findUnique({ where: { id: creatorId }, include: { brand: { select: { timezone: true } } } });
  if (!creator) throw new StatementError("Creator não encontrada.");
  if (!actor || !can(actor.grants, "money.view", creator.brandId)) throw new StatementError("Sem permissão.");
  if (opts.month !== undefined && !isMonthKey(opts.month)) throw new StatementError("Mês inválido.");
  const now = opts.now ?? new Date();
  const [ledger, release] = await Promise.all([readLedger(prisma, creator, now), releaseProgress(prisma, creator.id, now)]);
  return { ...statementForMonth(ledger, opts.month, monthKey(now, creator.brand.timezone)), release };
}
