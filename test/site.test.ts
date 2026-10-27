import { describe, expect, it } from "vitest";
import { canonicalRedirect, configuredOrigin, publicOrigin } from "@/lib/site";

const headers = (h: Record<string, string>) => ({ get: (n: string) => h[n] ?? null });
const prod = { APP_URL: "https://creatorclub.app.br", VERCEL_ENV: "production" };
const req = (pathname: string, host = "creatorclub-six.vercel.app", method = "GET", search = "") => ({ method, host, pathname, search });

describe("endereço do site (D-DOMAIN)", () => {
  it("links usam APP_URL; sem ele, o endereço da requisição", () => {
    expect(configuredOrigin({ APP_URL: " https://creatorclub.app.br/ " })).toBe("https://creatorclub.app.br");
    expect(configuredOrigin({ APP_URL: "lixo" })).toBeNull();
    expect(publicOrigin(headers({ host: "creatorclub-six.vercel.app" }), prod)).toBe("https://creatorclub.app.br");
    expect(publicOrigin(headers({ host: "creatorclub-six.vercel.app", "x-forwarded-proto": "https" }), {})).toBe("https://creatorclub-six.vercel.app");
    expect(publicOrigin(headers({ host: "localhost:3100" }), {})).toBe("http://localhost:3100");
  });

  it("tela aberta pelo endereço antigo vai para o domínio novo, no mesmo caminho", () => {
    expect(canonicalRedirect(req("/convite/abc", undefined, "GET", "?x=1"), prod)).toBe("https://creatorclub.app.br/convite/abc?x=1");
    expect(canonicalRedirect(req("/"), prod)).toBe("https://creatorclub.app.br/");
    expect(canonicalRedirect(req("/entrar", "creatorclub-abc123-gestao.vercel.app"), prod)).toBe("https://creatorclub.app.br/entrar");
  });

  it("integrações, envios de formulário, o domínio novo e as prévias ficam onde estão", () => {
    for (const p of ["/api/webhooks/shopify", "/api/forms/botanika/hunter", "/api/jobs/run", "/oauth/authorize", "/.well-known/oauth-authorization-server", "/r/maria/x"]) {
      expect(canonicalRedirect(req(p), prod)).toBeNull();
    }
    expect(canonicalRedirect(req("/entrar", undefined, "POST"), prod)).toBeNull();
    expect(canonicalRedirect(req("/entrar", "creatorclub.app.br"), prod)).toBeNull();
    expect(canonicalRedirect(req("/entrar"), { ...prod, VERCEL_ENV: "preview" })).toBeNull();
    expect(canonicalRedirect(req("/entrar"), { VERCEL_ENV: "production" })).toBeNull();
  });
});
