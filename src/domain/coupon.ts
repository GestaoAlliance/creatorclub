/**
 * Regras de código de cupom.
 * Cupom novo: letras A–Z e números, até 20 caracteres (D-SIGNUPACCOUNT; antes só letras, até 8).
 * Cupons legados (importados da loja) não passam por esta validação.
 */

export const NEW_COUPON_MAX_LENGTH = 20;

export type CouponKind = "CREATOR" | "PROMO";

/** Forma canônica para comparar códigos: maiúsculas, sem espaços nas pontas. */
export function normalizeCouponCode(code: string): string {
  return code.trim().toUpperCase();
}

export type CouponCodeError = "VAZIO" | "LONGO_DEMAIS" | "CARACTERE_INVALIDO";

/**
 * Valida o código que a creator escolhe para um cupom novo. Acentos são
 * removidos ("JOÃO" vira "JOAO"); qualquer outro caractere fora de A–Z e 0–9 é erro.
 */
export function validateNewCouponCode(
  input: string,
): { ok: true; code: string } | { ok: false; error: CouponCodeError } {
  const code = normalizeCouponCode(input.normalize("NFD").replace(/[̀-ͯ]/g, ""));
  if (code.length === 0) return { ok: false, error: "VAZIO" };
  if (!/^[A-Z0-9]+$/.test(code)) return { ok: false, error: "CARACTERE_INVALIDO" };
  if (code.length > NEW_COUPON_MAX_LENGTH) return { ok: false, error: "LONGO_DEMAIS" };
  return { ok: true, code };
}
