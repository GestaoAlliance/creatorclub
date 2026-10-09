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
