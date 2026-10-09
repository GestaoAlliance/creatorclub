import { normalizeCouponCode, type CouponKind } from "./coupon";

/**
 * Atribuição de pedido a uma creator.
 *
 * Regra first_creator_code_v1:
 *  1. Ler os códigos de desconto do pedido, na ordem devolvida pelo Shopify.
 *  2. Manter só os que eram cupom CREATOR da marca na data do pedido.
 *     Cupom PROMO (ex.: BOTANIKA) nunca atribui.
 *  3. O primeiro que sobrar leva o pedido inteiro.
 *  4. D-RATEIMPORT: se antes dele aparecer um cupom ainda não classificado, desconhecido ou com dona
 *     "a confirmar", o pedido fica PENDENTE (não é gravado e é decidido de novo depois da confirmação).
 *     Pular esse cupom poderia dar o pedido para a creator errada.
 *
 * A ordem devolvida pelo Shopify é uma convenção, não prova de qual cupom foi
 * aplicado primeiro; por isso a lista usada fica gravada como evidência.
 * A atribuição é decidida uma vez e gravada: trocar cupom ou status da creator
 * depois não move pedidos antigos.
 */

export const ATTRIBUTION_RULE = "first_creator_code_v1";

export type CouponAssignment = {
  couponId: string;
  brandId: string;
  code: string;
  /** null = ainda não classificado (D-CLASS). */
  kind: CouponKind | null;
  /** Dona do cupom; obrigatória para CREATOR, nula para PROMO. */
  creatorId: string | null;
  /** Dona confirmada pela Ana (D-RATEIMPORT). PROMO não tem dona e conta como confirmado. */
  confirmed: boolean;
  validFrom: Date;
  validTo: Date | null;
};

export type AttributionInput = {
  brandId: string;
  discountCodes: readonly string[];
  orderCreatedAt: Date;
};

export type Attribution = {
  couponId: string;
  creatorId: string;
  code: string;
  rule: typeof ATTRIBUTION_RULE;
  /** Códigos do pedido no momento da decisão (evidência). */
  evidenceCodes: string[];
};

export type PendingAttribution = {
  pending: true;
  code: string;
  reason: "unknown_coupon" | "unclassified" | "owner_unconfirmed";
  evidenceCodes: string[];
};

function isValidAt(a: CouponAssignment, at: Date): boolean {
  return a.validFrom <= at && (a.validTo === null || at < a.validTo);
}

export function isPending(r: Attribution | PendingAttribution | null): r is PendingAttribution {
  return r !== null && "pending" in r;
}

export function attributeOrder(
  order: AttributionInput,
  assignments: readonly CouponAssignment[],
): Attribution | PendingAttribution | null {
  const evidenceCodes = order.discountCodes.map(normalizeCouponCode);
  const pending = (code: string, reason: PendingAttribution["reason"]): PendingAttribution => ({
    pending: true,
    code,
    reason,
    evidenceCodes,
  });

  for (const code of evidenceCodes) {
    const ofCode = assignments.filter((a) => a.brandId === order.brandId && normalizeCouponCode(a.code) === code);
    if (ofCode.length === 0) return pending(code, "unknown_coupon");
    if (ofCode.some((a) => a.kind === null)) return pending(code, "unclassified");
    if (ofCode.every((a) => a.kind === "PROMO")) continue;
    const assignment = ofCode.find((a) => isValidAt(a, order.orderCreatedAt));
    if (!assignment) continue; // CREATOR sem dona nessa data: não atribui (cupom de outra época).
    if (assignment.kind !== "CREATOR") continue;
    if (!assignment.confirmed) return pending(code, "owner_unconfirmed");
    if (!assignment.creatorId) {
      throw new Error(`cupom CREATOR ${assignment.code} sem dona definida`);
    }
    return {
      couponId: assignment.couponId,
      creatorId: assignment.creatorId,
      code,
      rule: ATTRIBUTION_RULE,
      evidenceCodes,
    };
  }
  return null;
}
