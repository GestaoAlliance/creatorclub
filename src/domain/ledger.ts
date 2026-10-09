import type { Cents } from "./money";
import { DEFAULT_TIMEZONE, localDate } from "./time";

/**
 * Extrato da creator numa marca. O saldo é sempre a soma dos lançamentos;
 * nunca é recalculado a partir do Shopify e nunca é cortado em zero.
 */

export type LedgerType =
  | "COMMISSION"
  | "REVERSAL"
  | "WITHDRAWAL"
  | "ADJUSTMENT"
  | "OPENING_BALANCE";

export type LedgerEntry = {
  type: LedgerType;
  amountCents: Cents;
  availableAt: Date;
};

export type OpenWithdrawal = { amountCents: Cents };

export type Balance = {
  /** Soma de todos os lançamentos (pode ser negativa depois de estorno). */
  totalCents: Cents;
  /** Créditos ainda em retenção. */
  heldCents: Cents;
  /** Reservado por saques solicitados e ainda não pagos. */
  reservedCents: Cents;
  /** O que pode ser pedido em saque agora (pode ser negativo). */
  availableCents: Cents;
};

export function computeBalance(
  entries: readonly LedgerEntry[],
  openWithdrawals: readonly OpenWithdrawal[],
  now: Date,
): Balance {
  let totalCents = 0;
  let heldCents = 0;
  for (const e of entries) {
    totalCents += e.amountCents;
    if (e.amountCents > 0 && e.availableAt > now) heldCents += e.amountCents;
  }
  const reservedCents = openWithdrawals.reduce((sum, w) => sum + w.amountCents, 0);
  return {
    totalCents,
    heldCents,
    reservedCents,
    availableCents: totalCents - heldCents - reservedCents,
  };
}

/** "AAAA-MM" de uma data no fuso da marca. */
export function monthKey(at: Date, timeZone: string = DEFAULT_TIMEZONE): string {
  const { year, month } = localDate(at, timeZone);
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function isMonthKey(value: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

/**
 * Mês em que o lançamento aparece no extrato (D-MONTH): comissão e estorno de pedido contam no mês do
 * **pagamento** do pedido; o que não vem de pedido (ajuste, saque, abertura) conta no mês em que foi lançado.
 */
export function entryMonth(entry: { createdAt: Date; orderPaidAt: Date | null }, timeZone: string = DEFAULT_TIMEZONE): string {
  return monthKey(entry.orderPaidAt ?? entry.createdAt, timeZone);
}
