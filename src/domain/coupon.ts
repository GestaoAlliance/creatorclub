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

const letters = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[^a-z]/g, "");

/**
 * D-COUPONBOARD: sugere a dona de um cupom pelo código (ex.: VICTORIA10 → Victoria; CAROLFIT → @carolfit). Compara só
 * as letras do código com o @ do Instagram/TikTok, o nome inteiro, nome + sobrenome e o primeiro nome (com 4+ letras).
 * Só sugere quando uma creator só bate no melhor nível; empate ou nada = null (a Ana escolhe).
 */
export function suggestOwner<T extends { id: string; name: string; instagram?: string | null; tiktok?: string | null }>(code: string, creators: readonly T[]): T | null {
  const c = letters(code);
  if (c.length < 3) return null;
  const score = (x: T): number => {
    const handles = [x.instagram, x.tiktok].map((h) => letters(h ?? "")).filter((h) => h.length >= 3);
    if (handles.some((h) => h === c || (c.startsWith(h) && h.length >= 5))) return 4;
    const words = x.name.trim().split(/\s+/).map(letters).filter(Boolean);
    if (letters(x.name) === c) return 3;
    if (words.length >= 2 && (words[0]! + words.at(-1)! === c || words[0]! + words[1]! === c)) return 3;
    if (words[0] && words[0].length >= 4 && (c === words[0] || c.startsWith(words[0]))) return 2;
    if (words[0] && words[0].length >= 4 && words[0].startsWith(c) && c.length >= 4) return 1;
    return 0;
  };
  const scored = creators.map((x) => ({ x, s: score(x) })).filter((y) => y.s > 0);
  const best = Math.max(0, ...scored.map((y) => y.s));
  const top = scored.filter((y) => y.s === best);
  return top.length === 1 ? top[0]!.x : null;
}
