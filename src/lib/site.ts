/**
 * Endereço público do site (D-DOMAIN): `APP_URL` (produção: https://creatorclub.app.br). Todo link que sai do sistema
 * (convite, cupom, indicação, e-mail, WhatsApp) usa este endereço, mesmo quando a tela foi aberta pelo endereço antigo.
 * Sem `APP_URL` (local, prévias), usa o endereço por onde a página foi aberta.
 */

type Env = Record<string, string | undefined>;
type HeaderGetter = { get(name: string): string | null };

/** `APP_URL` sem barra no fim, ou null. */
export function configuredOrigin(env: Env = process.env): string | null {
  const raw = env.APP_URL?.trim();
  if (!raw) return null;
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

/** Endereço por onde a requisição chegou (sem `APP_URL`). */
export function requestOrigin(h: HeaderGetter): string {
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}

/** Endereço para montar links: `APP_URL` ou o da requisição. */
export function publicOrigin(h: HeaderGetter, env: Env = process.env): string {
  return configuredOrigin(env) ?? requestOrigin(h);
}

// Integrações automáticas e o conector do Claude continuam no endereço antigo (Shopify, formulários, worker, OAuth).
const KEEP_PATHS = /^\/(api|oauth|\.well-known|r)(\/|$)/;

/**
 * Tela aberta pelo endereço antigo da Vercel em produção: para onde mandar (mesmo caminho no domínio novo), ou null.
 * Só GET/HEAD; integrações ficam onde estão.
 */
export function canonicalRedirect(req: { method: string; host: string | null; pathname: string; search: string }, env: Env = process.env): string | null {
  const origin = configuredOrigin(env);
  if (!origin || env.VERCEL_ENV !== "production") return null;
  if (req.method !== "GET" && req.method !== "HEAD") return null;
  const host = req.host?.toLowerCase() ?? "";
  if (!host.endsWith(".vercel.app") || host === new URL(origin).host) return null;
  if (KEEP_PATHS.test(req.pathname)) return null;
  return `${origin}${req.pathname}${req.search}`;
}
