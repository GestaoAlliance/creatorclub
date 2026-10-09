import type { PrismaClient } from "@/generated/prisma/client";
import { computeBalance, entryMonth, isMonthKey, monthKey, type Balance, type LedgerType } from "@/domain";
import type { Actor } from "@/lib/auth/actor";
import { can } from "@/lib/auth/permissions";

/**
 * Saldo e extrato da creator numa marca (E5.4). O saldo é a soma de todos os lançamentos (nunca cortado em zero,
 * D-NEG), separado em "a liberar" (crédito ainda na retenção, D-HOLD), "reservado" (saque pedido) e "disponível".
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
  holdDays: number;
  /** Meses com lançamento, do mais recente ao mais antigo, com o total líquido de cada um. */
  months: { month: string; totalCents: number }[];
  month: string;
  lines: StatementLine[];
};

export async function creatorStatement(
  prisma: PrismaClient,
  actor: Actor | null,
  creatorId: string,
  opts: { month?: string; now?: Date } = {},
): Promise<Statement> {
  const creator = await prisma.creator.findUnique({ where: { id: creatorId }, include: { brand: { select: { timezone: true, commissionHoldDays: true } } } });
  if (!creator) throw new StatementError("Creator não encontrada.");
  if (!actor || !can(actor.grants, "money.view", creator.brandId)) throw new StatementError("Sem permissão.");
  if (opts.month !== undefined && !isMonthKey(opts.month)) throw new StatementError("Mês inválido.");
  const now = opts.now ?? new Date();
  const tz = creator.brand.timezone;

  const [entries, open] = await Promise.all([
    prisma.ledgerEntry.findMany({
      where: { creatorId, brandId: creator.brandId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      include: { order: { select: { name: true, paidAt: true } } },
    }),
    prisma.withdrawal.findMany({ where: { creatorId, brandId: creator.brandId, status: "REQUESTED" }, select: { amountCents: true } }),
  ]);

  const balance = computeBalance(entries, open, now);
  const totals = new Map<string, number>();
  const lines = entries.map((e) => {
    const line: StatementLine & { month: string } = {
      id: e.id,
      type: e.type,
      amountCents: e.amountCents,
      createdAt: e.createdAt,
      availableAt: e.availableAt,
      held: e.amountCents > 0 && e.availableAt > now,
      orderName: e.order?.name ?? null,
      orderPaidAt: e.order?.paidAt ?? null,
      baseCents: e.baseCents,
      rateBps: e.rateBps,
      note: e.note,
      month: entryMonth({ createdAt: e.createdAt, orderPaidAt: e.order?.paidAt ?? null }, tz),
    };
    totals.set(line.month, (totals.get(line.month) ?? 0) + e.amountCents);
    return line;
  });

  const months = [...totals.entries()].sort(([a], [b]) => (a < b ? 1 : -1)).map(([month, totalCents]) => ({ month, totalCents }));
  const month = opts.month ?? months[0]?.month ?? monthKey(now, tz);
  return {
    balance,
    holdDays: creator.brand.commissionHoldDays,
    months,
    month,
    lines: lines
      .filter((l) => l.month === month)
      .sort((a, b) => (b.orderPaidAt ?? b.createdAt).getTime() - (a.orderPaidAt ?? a.createdAt).getTime())
      .map(({ month: _m, ...l }) => l),
  };
}
