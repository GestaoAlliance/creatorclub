/** Regras puras de login (sem rede): validadas no servidor e testadas sem banco. */

export const PASSWORD_MIN_LENGTH = 10;
export const DEFAULT_AFTER_LOGIN = "/conta";

export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const email = raw.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

export function passwordProblem(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length < PASSWORD_MIN_LENGTH) {
    return `A senha precisa ter pelo menos ${PASSWORD_MIN_LENGTH} caracteres.`;
  }
  return null;
}

/**
 * Para onde ir depois de entrar. Só caminhos internos: nunca outro site
 * (bloqueia "//site", "/\\site", "https://..." e afins).
 */
export function safeNextPath(raw: unknown): string {
  if (typeof raw !== "string" || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) {
    return DEFAULT_AFTER_LOGIN;
  }
  try {
    const url = new URL(raw, "http://interno.invalid");
    if (url.origin !== "http://interno.invalid") return DEFAULT_AFTER_LOGIN;
    return `${url.pathname}${url.search}`;
  } catch {
    return DEFAULT_AFTER_LOGIN;
  }
}
