import { assertCents, type Cents } from "./money";
import { DEFAULT_TIMEZONE, localDate } from "./time";

/**
 * Regras para solicitar saque. A checagem roda de novo no servidor, dentro da
 * transação que trava a carteira da creator; esta função só decide se o pedido
 * é válido com os números lidos nessa transação.
 */

export type WithdrawalPolicy = {
  minCents: Cents;
  /** Dias do mês, inclusivos, no fuso da marca. */
  windowStartDay: number;
  windowEndDay: number;
  timeZone?: string;
};

export type WithdrawalRequestCheck = {
  amountCents: Cents;
  availableCents: Cents;
  hasOpenWithdrawal: boolean;
  now: Date;
};

export type WithdrawalError =
  | "FORA_DA_JANELA"
  | "VALOR_INVALIDO"
  | "ABAIXO_DO_MINIMO"
  | "SALDO_INSUFICIENTE"
  | "VALOR_PARCIAL"
  | "SAQUE_EM_ABERTO";

export function isInsideWithdrawalWindow(now: Date, policy: Omit<WithdrawalPolicy, "minCents">): boolean {
  const { day } = localDate(now, policy.timeZone ?? DEFAULT_TIMEZONE);
  return day >= policy.windowStartDay && day <= policy.windowEndDay;
}

export function checkWithdrawalRequest(
  req: WithdrawalRequestCheck,
  policy: WithdrawalPolicy,
): WithdrawalError[] {
  const errors: WithdrawalError[] = [];
  if (!isInsideWithdrawalWindow(req.now, policy)) errors.push("FORA_DA_JANELA");
  if (!Number.isSafeInteger(req.amountCents) || req.amountCents <= 0) {
    errors.push("VALOR_INVALIDO");
    return errors;
  }
  assertCents(req.availableCents, "disponível");
  if (req.amountCents < policy.minCents) errors.push("ABAIXO_DO_MINIMO");
  if (req.amountCents > req.availableCents) errors.push("SALDO_INSUFICIENTE");
  // D-CONTRACT: o saque é sempre do total disponível (a NF é do valor total do mês).
  if (req.amountCents < req.availableCents) errors.push("VALOR_PARCIAL");
  if (req.hasOpenWithdrawal) errors.push("SAQUE_EM_ABERTO");
  return errors;
}
