import { assertShopDomain, ShopifyError } from "./client";

/**
 * Chave de acesso de apps do Dev Dashboard (D-SHOPAPP): o app troca Client ID + Client secret por uma chave que
 * vale 24 h ("client credentials grant"). Só funciona quando app e loja estão na mesma organização do Shopify.
 * A chave fica só em memória e é pedida de novo 10 min antes de vencer.
 */

export type AccessToken = { accessToken: string; scopes: string[]; expiresAt: Date };

const REFRESH_BEFORE_MS = 10 * 60_000;
const cache = new Map<string, AccessToken>();

export async function requestAccessToken(
  input: { shop: string; clientId: string; clientSecret: string },
  opts: { fetch?: typeof fetch; now?: Date } = {},
): Promise<AccessToken> {
  const shop = assertShopDomain(input.shop);
  const doFetch = opts.fetch ?? fetch;
  let res: Response;
  try {
    res = await doFetch(`https://${shop}/admin/oauth/access_token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: new URLSearchParams({ client_id: input.clientId, client_secret: input.clientSecret, grant_type: "client_credentials" }).toString(),
    });
  } catch {
    throw new ShopifyError("Falha de rede ao pedir a chave de acesso ao Shopify.", true);
  }
  const text = await res.text();
  if (!res.ok) {
    if (text.includes("app_not_installed")) throw new ShopifyError("O app ainda não está instalado nesta loja (app_not_installed).", false);
    if (text.includes("shop_not_permitted")) {
      throw new ShopifyError("O app e a loja não estão na mesma organização do Shopify (shop_not_permitted).", false);
    }
    // Nunca devolve o corpo: pode ecoar credenciais.
    throw new ShopifyError(`Shopify recusou o Client ID/Client secret (${res.status}).`, res.status >= 500 || res.status === 429);
  }
  const body = JSON.parse(text) as { access_token?: string; scope?: string; expires_in?: number };
  if (!body.access_token) throw new ShopifyError("Resposta do Shopify sem chave de acesso.", true);
  const now = opts.now ?? new Date();
  return {
    accessToken: body.access_token,
    scopes: (body.scope ?? "").split(",").map((s) => s.trim()).filter(Boolean),
    expiresAt: new Date(now.getTime() + (body.expires_in ?? 86_399) * 1000),
  };
}

/** Chave válida para a marca, reaproveitando a que está em memória enquanto faltar mais de 10 min para vencer. */
export async function accessTokenFor(
  key: string,
  input: { shop: string; clientId: string; clientSecret: string },
  opts: { fetch?: typeof fetch; now?: Date } = {},
): Promise<string> {
  const now = opts.now ?? new Date();
  const cached = cache.get(key);
  if (cached && cached.expiresAt.getTime() - now.getTime() > REFRESH_BEFORE_MS) return cached.accessToken;
  const fresh = await requestAccessToken(input, opts);
  cache.set(key, fresh);
  return fresh.accessToken;
}

/** Esquece a chave da marca (ex.: o Shopify recusou com 401 porque o app foi reinstalado). */
export function forgetAccessToken(key: string) {
  cache.delete(key);
}

export function clearAccessTokenCache() {
  cache.clear();
}
