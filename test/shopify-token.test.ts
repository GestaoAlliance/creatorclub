import { beforeEach, describe, expect, it } from "vitest";
import { accessTokenFor, clearAccessTokenCache, requestAccessToken } from "@/lib/shopify/token";

const creds = { shop: "loja-dev.myshopify.com", clientId: "cid", clientSecret: "csec-segredo" };

function fakeFetch(responses: Array<{ status: number; body: string }>) {
  const calls: Array<{ url: string; body: string }> = [];
  const fn = (async (url: string, init: RequestInit) => {
    calls.push({ url, body: String(init.body) });
    const r = responses.shift()!;
    return new Response(r.body, { status: r.status });
  }) as unknown as typeof fetch;
  return { fn, calls };
}

const ok = (token: string) => ({ status: 200, body: JSON.stringify({ access_token: token, scope: "read_orders,write_discounts", expires_in: 86399 }) });

beforeEach(() => clearAccessTokenCache());

describe("chave de acesso do Shopify (client credentials)", () => {
  it("troca Client ID/secret pela chave de 24 h", async () => {
    const { fn, calls } = fakeFetch([ok("tok-1")]);
    const now = new Date("2026-10-09T12:00:00Z");
    const t = await requestAccessToken(creds, { fetch: fn, now });
    expect(t).toEqual({ accessToken: "tok-1", scopes: ["read_orders", "write_discounts"], expiresAt: new Date("2026-10-10T11:59:59Z") });
    expect(calls[0]!.url).toBe("https://loja-dev.myshopify.com/admin/oauth/access_token");
    expect(new URLSearchParams(calls[0]!.body).get("grant_type")).toBe("client_credentials");
  });

  it("loja fora da organização do app e credencial errada dão mensagens claras, sem ecoar o segredo", async () => {
    const a = fakeFetch([{ status: 400, body: '{"error":"shop_not_permitted"}' }]);
    await expect(requestAccessToken(creds, { fetch: a.fn })).rejects.toThrow(/mesma organização/);
    const b = fakeFetch([{ status: 401, body: '{"error":"invalid_client csec-segredo"}' }]);
    const err = await requestAccessToken(creds, { fetch: b.fn }).catch((e: Error) => e);
    expect(String(err)).toMatch(/recusou o Client ID/);
    expect(String(err)).not.toContain("csec-segredo");
  });

  it("reaproveita a chave em memória e pede outra 10 min antes de vencer", async () => {
    const { fn, calls } = fakeFetch([ok("tok-1"), ok("tok-2")]);
    const t0 = new Date("2026-10-09T12:00:00Z");
    expect(await accessTokenFor("marca", creds, { fetch: fn, now: t0 })).toBe("tok-1");
    expect(await accessTokenFor("marca", creds, { fetch: fn, now: new Date("2026-10-10T11:40:00Z") })).toBe("tok-1");
    expect(await accessTokenFor("marca", creds, { fetch: fn, now: new Date("2026-10-10T11:51:00Z") })).toBe("tok-2");
    expect(calls).toHaveLength(2);
  });
});

describe("chave cancelada pelo Shopify (app reinstalado)", () => {
  it("em 401 esquece a chave, pede outra e tenta de novo uma vez", async () => {
    const { refreshingClient } = await import("@/lib/shopify/jobs");
    let tokenCalls = 0;
    const seen: string[] = [];
    const fn = (async (url: string, init: RequestInit) => {
      if (url.endsWith("/admin/oauth/access_token")) {
        tokenCalls++;
        return new Response(JSON.stringify({ access_token: `tok-${tokenCalls}`, scope: "read_orders", expires_in: 86399 }), { status: 200 });
      }
      const token = (init.headers as Record<string, string>)["x-shopify-access-token"]!;
      seen.push(token);
      if (token === "tok-1") return new Response("{}", { status: 401 });
      return new Response(JSON.stringify({ data: { shop: { name: "ok" } } }), { status: 200 });
    }) as unknown as typeof fetch;

    const client = await refreshingClient("marca-401", creds, { fetch: fn });
    expect(await client.graphql<{ shop: { name: string } }>("query { shop { name } }")).toEqual({ shop: { name: "ok" } });
    expect(seen).toEqual(["tok-1", "tok-2"]);
    expect(tokenCalls).toBe(2);
    // A chave nova ficou guardada: o próximo cliente já usa tok-2, sem pedir outra.
    const again = await refreshingClient("marca-401", creds, { fetch: fn });
    await again.graphql("query { shop { name } }");
    expect(tokenCalls).toBe(2);
  });

  it("se a chave nova também for recusada, devolve o erro (não fica em laço)", async () => {
    const { refreshingClient } = await import("@/lib/shopify/jobs");
    let tokenCalls = 0;
    const fn = (async (url: string) => {
      if (url.endsWith("/admin/oauth/access_token")) {
        tokenCalls++;
        return new Response(JSON.stringify({ access_token: `t${tokenCalls}`, scope: "read_orders", expires_in: 86399 }), { status: 200 });
      }
      return new Response("{}", { status: 401 });
    }) as unknown as typeof fetch;
    const client = await refreshingClient("marca-401b", creds, { fetch: fn });
    await expect(client.graphql("query { shop { name } }")).rejects.toThrow(/401/);
    expect(tokenCalls).toBe(2);
  });
});
