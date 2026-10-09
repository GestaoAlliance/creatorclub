/**
 * Cliente mínimo da GraphQL Admin API do Shopify. Só o servidor usa (sync, reconciliação, carga histórica e
 * ações de cupom); nenhuma tela consulta o Shopify. Versão da API fixa; respeita o limite de custo
 * (THROTTLED) e tenta de novo em 429/5xx. Mensagens de erro nunca levam o token.
 */

export const SHOPIFY_API_VERSION = "2026-10";

const SHOP_DOMAIN = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/;

export class ShopifyError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

export type ShopifyClientOptions = {
  shop: string;
  accessToken: string;
  apiVersion?: string;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  maxAttempts?: number;
};

type GraphQLError = { message?: string; extensions?: { code?: string } };
type ThrottleStatus = { currentlyAvailable?: number; restoreRate?: number };
type GraphQLBody<T> = {
  data?: T;
  errors?: GraphQLError[] | string;
  extensions?: { cost?: { requestedQueryCost?: number; throttleStatus?: ThrottleStatus } };
};

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Só aceita o domínio `*.myshopify.com`: o endereço chamado nunca vem de texto livre. */
export function assertShopDomain(shop: string): string {
  const s = shop.trim().toLowerCase();
  if (!SHOP_DOMAIN.test(s)) throw new ShopifyError(`Domínio de loja inválido: ${shop}`, false);
  return s;
}

/** Espera até o balde de custo ter o suficiente para a consulta (mínimo 1 s). */
export function throttleWaitMs(cost: { requestedQueryCost?: number; throttleStatus?: ThrottleStatus } | undefined): number {
  const needed = cost?.requestedQueryCost ?? 0;
  const available = cost?.throttleStatus?.currentlyAvailable ?? 0;
  const rate = cost?.throttleStatus?.restoreRate || 50;
  return Math.max(1000, Math.ceil(((needed - available) / rate) * 1000));
}

export function createShopifyClient(opts: ShopifyClientOptions) {
  const shop = assertShopDomain(opts.shop);
  const url = `https://${shop}/admin/api/${opts.apiVersion ?? SHOPIFY_API_VERSION}/graphql.json`;
  const doFetch = opts.fetch ?? fetch;
  const sleep = opts.sleep ?? defaultSleep;
  const maxAttempts = opts.maxAttempts ?? 5;

  async function graphql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
    let lastError: ShopifyError | undefined;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      let res: Response;
      try {
        res = await doFetch(url, {
          method: "POST",
          headers: { "content-type": "application/json", "x-shopify-access-token": opts.accessToken },
          body: JSON.stringify({ query, variables }),
        });
      } catch {
        lastError = new ShopifyError("Falha de rede ao chamar o Shopify.", true);
        await sleep(1000 * 2 ** (attempt - 1));
        continue;
      }

      if (res.status === 429 || res.status >= 500) {
        lastError = new ShopifyError(`Shopify respondeu ${res.status}.`, true);
        const retryAfter = Number(res.headers.get("retry-after"));
        await sleep(retryAfter > 0 ? retryAfter * 1000 : 1000 * 2 ** (attempt - 1));
        continue;
      }
      if (res.status === 401 || res.status === 403) {
        throw new ShopifyError(`Shopify recusou o acesso (${res.status}): token inválido ou sem permissão.`, false);
      }
      if (!res.ok) throw new ShopifyError(`Shopify respondeu ${res.status}.`, false);

      const body = (await res.json()) as GraphQLBody<T>;
      const errors = typeof body.errors === "string" ? [{ message: body.errors }] : (body.errors ?? []);
      if (errors.some((e) => e.extensions?.code === "THROTTLED")) {
        lastError = new ShopifyError("Limite de custo do Shopify atingido.", true);
        await sleep(throttleWaitMs(body.extensions?.cost));
        continue;
      }
      if (errors.length > 0) {
        throw new ShopifyError(`Erro do Shopify: ${errors.map((e) => e.message ?? "sem mensagem").join("; ")}`, false);
      }
      if (body.data === undefined) throw new ShopifyError("Resposta do Shopify sem dados.", false);
      return body.data;
    }
    throw lastError ?? new ShopifyError("Shopify indisponível.", true);
  }

  return { shop, graphql };
}

export type ShopifyClient = ReturnType<typeof createShopifyClient>;
