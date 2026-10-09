import { applyRate, assertBps, assertCents, type Bps, type Cents } from "./money";

/**
 * Comissão de um pedido, calculada de forma incremental e idempotente.
 *
 * A cada nova versão do pedido:
 *   devido   = elegível ? arred(base × taxa congelada) : 0
 *   lançado  = soma dos lançamentos já feitos para o pedido
 *   diferença ≠ 0 → um novo lançamento (COMMISSION se positivo, REVERSAL se negativo)
 *
 * Reprocessar a mesma versão não gera nada (diferença zero) e a chave de
 * idempotência inclui a versão, para permitir ajustes legítimos depois
 * (ex.: reembolso parcial dias após o crédito).
 */

/** Status financeiros (displayFinancialStatus) que contam como pagos. */
const PAID_STATUSES = new Set(["PAID", "PARTIALLY_REFUNDED"]);

export type OrderSnapshot = {
  id: string;
  financialStatus: string;
  cancelledAt: Date | null;
  test: boolean;
  /** Subtotal atual dos produtos, já com descontos e reembolsos, sem frete. */
  subtotalCents: Cents;
  paidAt: Date | null;
  /** updatedAt do Shopify: versão desta foto do pedido. */
  version: Date;
};

export function isEligible(order: OrderSnapshot): boolean {
  return (
    PAID_STATUSES.has(order.financialStatus) &&
    order.cancelledAt === null &&
    !order.test &&
    order.paidAt !== null
  );
}

export type LedgerEntryDraft = {
  type: "COMMISSION" | "REVERSAL";
  amountCents: Cents;
  orderId: string;
  baseCents: Cents;
  rateBps: Bps;
  availableAt: Date;
  idempotencyKey: string;
};

export type CommissionInput = {
  order: OrderSnapshot;
  /** Taxa gravada na atribuição (vigente no pagamento). */
  frozenRateBps: Bps;
  /** Soma dos lançamentos já feitos para este pedido. */
  postedCents: Cents;
  /** Dias de retenção antes do crédito ficar disponível para saque. */
  // D-HOLD: 7 dias por padrão (Brand.commissionHoldDays).
  holdDays: number;
  /** Instante do processamento (para débitos, que valem na hora). */
  now: Date;
};

export function commissionTarget(order: OrderSnapshot, rateBps: Bps): Cents {
  if (!isEligible(order)) return 0;
  return applyRate(Math.max(0, order.subtotalCents), rateBps);
}

export function computeCommissionEntry(input: CommissionInput): LedgerEntryDraft | null {
  const { order, frozenRateBps, postedCents, holdDays, now } = input;
  assertBps(frozenRateBps);
  assertCents(postedCents, "lançado");
  assertCents(order.subtotalCents, "subtotal");
  if (!Number.isInteger(holdDays) || holdDays < 0) {
    throw new RangeError(`dias de retenção inválidos: ${holdDays}`);
  }

  const target = commissionTarget(order, frozenRateBps);
  const delta = target - postedCents;
  if (delta === 0) return null;

  const availableAt =
    delta > 0 && order.paidAt
      ? new Date(order.paidAt.getTime() + holdDays * 86_400_000)
      : now;

  return {
    type: delta > 0 ? "COMMISSION" : "REVERSAL",
    amountCents: delta,
    orderId: order.id,
    baseCents: isEligible(order) ? order.subtotalCents : 0,
    rateBps: frozenRateBps,
    availableAt,
    idempotencyKey: `commission:${order.id}:${order.version.toISOString()}`,
  };
}
