/**
 * Telefone brasileiro (D-PHONE, pedido do responsável em 2026-10-27): muitas creators digitam o +55 junto com o DDD e o
 * número. Só DDD + número fica gravado; o 55 do país na frente (com 12 ou 13 dígitos) é tirado.
 */

/** Só os dígitos de DDD + número (sem 0 nem 55 do país na frente). Pode vir incompleto. */
export function brPhoneDigits(value: string): string {
  let d = value.replace(/\D/g, "").replace(/^0+/, "");
  if (d.startsWith("55") && d.length > 11) d = d.slice(2);
  return d.slice(0, 11);
}

/** "(31) 99211-3232" enquanto digita (aceita parcial). */
export function formatBrPhone(value: string): string {
  const d = brPhoneDigits(value);
  if (d.length <= 2) return d.length ? `(${d}` : "";
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

/** Telefone completo (DDD + 8 ou 9 dígitos), formatado; ou null. */
export function validBrPhone(value: string): string | null {
  const raw = value.replace(/\D/g, "").replace(/^0+/, "");
  // Mais de 13 dígitos, ou 12/13 sem o 55 na frente: não é um telefone brasileiro.
  if (raw.length > 13 || (raw.length > 11 && !raw.startsWith("55"))) return null;
  const d = brPhoneDigits(value);
  return d.length === 10 || d.length === 11 ? formatBrPhone(d) : null;
}
