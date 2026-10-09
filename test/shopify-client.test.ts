import { describe, expect, it } from "vitest";
import { assertShopDomain, createShopifyClient, SHOPIFY_API_VERSION, throttleWaitMs } from "@/lib/shopify/client";

const TOKEN = "shpat_segredo";

function fakeFetch(responses: Array<Response | Error>) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fn = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const next = responses.shift();
    if (!next) throw new Error("sem resposta");
    if (next instanceof Error) throw next;
    return next;
  }) as unknown as typeof fetch;
  return { fn, calls };
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

function client(responses: Array<Response | Error>) {
  const { fn, calls } = fakeFetch(responses);
  const sleeps: number[] = [];
  const c = createShopifyClient({ shop: "loja-teste.myshopify.com", accessToken: TOKEN, fetch: fn, sleep: async (ms) => void sleeps.push(ms) });
  return { c, calls, sleeps };
}

describe("cliente do Shopify", () => {
  it("chama a versão fixa da API com o token no cabeçalho", async () => {
    const { c, calls } = client([json({ data: { shop: { name: "Loja" } } })]);
    expect(await c.graphql("query { shop { name } }", { a: 1 })).toEqual({ shop: { name: "Loja" } });
    expect(calls[0]!.url).toBe(`https://loja-teste.myshopify.com/admin/api/${SHOPIFY_API_VERSION}/graphql.json`);
    expect((calls[0]!.init.headers as Record<string, string>)["x-shopify-access-token"]).toBe(TOKEN);
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({ query: "query { shop { name } }", variables: { a: 1 } });
  });

  it("espera e tenta de novo quando o custo estoura (THROTTLED)", async () => {
    const throttled = {
      errors: [{ message: "Throttled", extensions: { code: "THROTTLED" } }],
      extensions: { cost: { requestedQueryCost: 500, throttleStatus: { currentlyAvailable: 100, restoreRate: 100 } } },
    };
    const { c, sleeps } = client([json(throttled), json({ data: { ok: true } })]);
    expect(await c.graphql("query { ok }")).toEqual({ ok: true });
    expect(sleeps).toEqual([4000]);
  });

  it("tenta de novo em 429 (respeitando Retry-After), 5xx e falha de rede", async () => {
    const { c, sleeps } = client([json({}, 429, { "retry-after": "2" }), json({}, 503), new Error("ECONNRESET"), json({ data: { ok: 1 } })]);
    expect(await c.graphql("query { ok }")).toEqual({ ok: 1 });
    expect(sleeps).toEqual([2000, 2000, 4000]);
  });

  it("desiste depois do limite de tentativas, com erro que pode ser repetido depois", async () => {
    const { c } = client(Array.from({ length: 5 }, () => json({}, 502)));
    await expect(c.graphql("query { ok }")).rejects.toMatchObject({ retryable: true, message: "Shopify respondeu 502." });
  });

  it("token recusado e erro de consulta falham na hora, sem o token na mensagem", async () => {
    const a = client([json({ errors: "[API] Invalid API key or access token" }, 401)]);
    const err = await a.c.graphql("query { ok }").catch((e: Error) => e);
    expect(err).toMatchObject({ retryable: false });
    expect(String((err as Error).message)).not.toContain(TOKEN);

    const b = client([json({ errors: [{ message: "Field 'x' doesn't exist" }] })]);
    await expect(b.c.graphql("query { x }")).rejects.toMatchObject({ retryable: false, message: "Erro do Shopify: Field 'x' doesn't exist" });
  });

  it("só aceita domínio *.myshopify.com", () => {
    expect(assertShopDomain(" Loja-1.myshopify.com ")).toBe("loja-1.myshopify.com");
    for (const bad of ["evil.com", "loja.myshopify.com.evil.com", "https://loja.myshopify.com", "loja.myshopify.com/x", ""]) {
      expect(() => assertShopDomain(bad)).toThrow(/inválido/);
    }
  });

  it("calcula a espera pelo custo que falta e a taxa de reposição (mínimo 1 s)", () => {
    expect(throttleWaitMs({ requestedQueryCost: 1000, throttleStatus: { currentlyAvailable: 0, restoreRate: 100 } })).toBe(10_000);
    expect(throttleWaitMs({ requestedQueryCost: 10, throttleStatus: { currentlyAvailable: 50, restoreRate: 100 } })).toBe(1000);
    expect(throttleWaitMs(undefined)).toBe(1000);
  });
});
