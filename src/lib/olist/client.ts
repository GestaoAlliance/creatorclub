/**
 * Cliente da API v2 do Olist ERP (antigo Tiny), D-OLIST: POST em https://api.tiny.com.br/api2/<método>.php com o token
 * da conta da marca e `formato=json`. A resposta sempre vem em `retorno`, com `status` "OK" ou "Erro" e `erros`.
 * Só no servidor; o token vem da variável secreta `OLIST_TOKENS` (Vercel).
 */
export const OLIST_API = "https://api.tiny.com.br/api2";

export class OlistError extends Error {}

export type OlistFetcher = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;
const defaultFetch: OlistFetcher = (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(15_000) });

type Retorno = { status?: string; codigo_erro?: string | number; erros?: { erro?: string }[]; [k: string]: unknown };

/** Token da marca na variável `OLIST_TOKENS` (JSON `{ "<slug>": "<token>" }`), ou null. */
export function olistToken(slug: string, env: Record<string, string | undefined> = process.env): string | null {
  const raw = env.OLIST_TOKENS?.trim();
  if (!raw) return null;
  try {
    const t = (JSON.parse(raw) as Record<string, unknown>)[slug];
    return typeof t === "string" && /^[A-Za-z0-9]{20,200}$/.test(t.trim()) ? t.trim() : null;
  } catch {
    return null;
  }
}

/** Chamada a um método da API. "Sem registros" (código 20) volta como retorno com status "Erro" para quem chamou decidir. */
export async function olistCall(token: string, method: string, params: Record<string, string>, fetcher: OlistFetcher = defaultFetch): Promise<Retorno> {
  const body = new URLSearchParams({ token, formato: "json", ...params }).toString();
  let res;
  try {
    res = await fetcher(`${OLIST_API}/${method}.php`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
  } catch {
    throw new OlistError("Não foi possível falar com o Olist.");
  }
  const text = await res.text();
  let json: { retorno?: Retorno };
  try {
    json = JSON.parse(text);
  } catch {
    throw new OlistError(`Olist respondeu ${res.status} sem JSON.`);
  }
  const r = json.retorno;
  if (!r) throw new OlistError("Resposta do Olist sem 'retorno'.");
  if (r.status !== "OK" && String(r.codigo_erro) !== "20") {
    const msg = (r.erros ?? []).map((e) => e.erro).filter(Boolean).join("; ") || "erro sem mensagem";
    throw new OlistError(`Olist: ${msg}`);
  }
  return r;
}

const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v.replace(",", ".")) : NaN;
  return Number.isFinite(n) ? n : null;
};

/**
 * Saldo do produto pelo código (SKU) igual ao da Shopify: pesquisa o produto, confere o código exato e lê o estoque.
 * Produto não encontrado → `{ found: false }`.
 */
export async function olistStockBySku(token: string, sku: string, fetcher?: OlistFetcher): Promise<{ found: false } | { found: true; id: string; saldo: number }> {
  const search = await olistCall(token, "produtos.pesquisa", { pesquisa: sku }, fetcher);
  const list = (search.produtos as { produto?: { id?: string | number; codigo?: string } }[] | undefined) ?? [];
  const hit = list.map((x) => x.produto).find((p) => p && String(p.codigo ?? "").trim().toUpperCase() === sku.trim().toUpperCase());
  if (!hit?.id) return { found: false };
  const stock = await olistCall(token, "produto.obter.estoque", { id: String(hit.id) }, fetcher);
  const saldo = num((stock.produto as { saldo?: unknown } | undefined)?.saldo);
  if (saldo === null) throw new OlistError(`Olist não informou o saldo do produto ${sku}.`);
  return { found: true, id: String(hit.id), saldo: Math.floor(saldo) };
}
