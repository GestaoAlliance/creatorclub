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

/**
 * D-AUTHDOWN: o erro do login veio do serviço fora do ar (e não da senha)? Sem resposta (rede), erro 5xx ou projeto
 * bloqueado pela cota (402, como em 19 a 23/11). Senha errada (400) e excesso de tentativas (429) não contam: esses
 * seguem com a mensagem única, que não revela se a conta existe.
 */
export function authServiceDown(error: unknown): boolean {
  if (!error || typeof error !== "object") return true;
  const status = (error as { status?: unknown }).status;
  if (typeof status !== "number" || status === 0) return true;
  return status === 402 || status >= 500;
}

export const AUTH_DOWN_MESSAGE = "O sistema está fora do ar agora. Não é a sua senha: tente de novo em alguns minutos.";

/**
 * D-INVITELOGIN: quem já tem login abre o convite, entra com a senha de sempre e volta para o mesmo convite já
 * logada (só falta o "Aceitar"). Não revela se o e-mail tem conta: o atalho aparece para todos.
 */
export function inviteLoginPath(token: string, email: string | null): string {
  const q = new URLSearchParams({ next: `/convite/${encodeURIComponent(token)}` });
  if (email) q.set("email", email);
  return `/entrar?${q.toString()}`;
}
