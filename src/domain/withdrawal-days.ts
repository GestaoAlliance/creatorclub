/**
 * D-REVITARULES: dias do saque de cada marca nos textos do portal, dos avisos e da inscrição (a regra em si já vinha de
 * `Brand.withdrawalWindowStartDay/EndDay`). Botanika e VermeFree: pedido do dia 1 ao 10, Pix até o dia 15. Revita
 * (contrato de 2026-10-30): pedido do dia 5 ao 15, pagamento do dia 20 ao 25.
 */
export type WithdrawalDays = { start: number; end: number; payFrom: number | null; payBy: number };

export const DEFAULT_WITHDRAWAL_DAYS: WithdrawalDays = { start: 1, end: 10, payFrom: null, payBy: 15 };

export function withdrawalDays(b: { withdrawalWindowStartDay: number; withdrawalWindowEndDay: number; withdrawalPayFromDay: number | null; withdrawalPayByDay: number }): WithdrawalDays {
  return { start: b.withdrawalWindowStartDay, end: b.withdrawalWindowEndDay, payFrom: b.withdrawalPayFromDay, payBy: b.withdrawalPayByDay };
}

/** "do dia 1 ao 10" */
export const requestDaysText = (d: WithdrawalDays = DEFAULT_WITHDRAWAL_DAYS) => `do dia ${d.start} ao ${d.end}`;

/** "até o dia 15" ou "do dia 20 ao 25" */
export const payDaysText = (d: WithdrawalDays = DEFAULT_WITHDRAWAL_DAYS) => (d.payFrom ? `do dia ${d.payFrom} ao ${d.payBy}` : `até o dia ${d.payBy}`);

/** Troca {pedido}, {Pedido} e {pagamento} num texto pelos dias da marca. */
export function fillWithdrawalDays(text: string, d: WithdrawalDays = DEFAULT_WITHDRAWAL_DAYS): string {
  const req = requestDaysText(d);
  return text.replaceAll("{Pedido}", req[0]!.toUpperCase() + req.slice(1)).replaceAll("{pedido}", req).replaceAll("{pagamento}", payDaysText(d));
}
