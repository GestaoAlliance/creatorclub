import { describe, expect, it } from "vitest";
import { authServiceDown, DEFAULT_AFTER_LOGIN, inviteLoginPath, normalizeEmail, passwordProblem, safeNextPath } from "@/lib/auth/rules";

describe("safeNextPath", () => {
  it("aceita caminhos internos", () => {
    expect(safeNextPath("/conta")).toBe("/conta");
    expect(safeNextPath("/painel/botanika?aba=extrato")).toBe("/painel/botanika?aba=extrato");
  });

  it("nunca leva para outro site", () => {
    for (const bad of ["//evil.com", "/\\evil.com", "https://evil.com", "evil.com", "", null, undefined, 42]) {
      expect(safeNextPath(bad)).toBe(DEFAULT_AFTER_LOGIN);
    }
  });
});

describe("normalizeEmail", () => {
  it("normaliza e valida", () => {
    expect(normalizeEmail("  Ana@Botanika.com.br ")).toBe("ana@botanika.com.br");
    expect(normalizeEmail("sem-arroba")).toBeNull();
    expect(normalizeEmail(undefined)).toBeNull();
  });
});

describe("passwordProblem", () => {
  it("exige pelo menos 10 caracteres", () => {
    expect(passwordProblem("123456789")).toMatch(/10 caracteres/);
    expect(passwordProblem("1234567890")).toBeNull();
    expect(passwordProblem(null)).not.toBeNull();
  });
});

describe("authServiceDown (D-AUTHDOWN)", () => {
  it("senha errada e excesso de tentativas não são queda", () => {
    expect(authServiceDown({ status: 400, code: "invalid_credentials" })).toBe(false);
    expect(authServiceDown({ status: 422 })).toBe(false);
    expect(authServiceDown({ status: 429 })).toBe(false);
  });

  it("cota estourada, erro do servidor e falta de resposta são queda", () => {
    expect(authServiceDown({ status: 402 })).toBe(true);
    expect(authServiceDown({ status: 500 })).toBe(true);
    expect(authServiceDown({ status: 503 })).toBe(true);
    expect(authServiceDown({ status: 0 })).toBe(true);
    expect(authServiceDown({ name: "AuthRetryableFetchError" })).toBe(true);
    expect(authServiceDown(new TypeError("fetch failed"))).toBe(true);
    expect(authServiceDown(undefined)).toBe(true);
  });
});

describe("inviteLoginPath (D-INVITELOGIN)", () => {
  it("leva ao login com o e-mail preenchido e volta para o mesmo convite", () => {
    const path = inviteLoginPath("abc_123", "fatima@x.com");
    const url = new URL(path, "http://interno.invalid");
    expect(url.pathname).toBe("/entrar");
    expect(url.searchParams.get("email")).toBe("fatima@x.com");
    expect(safeNextPath(url.searchParams.get("next"))).toBe("/convite/abc_123");
  });
  it("convite aberto: sem e-mail", () => {
    expect(new URL(inviteLoginPath("t", null), "http://interno.invalid").searchParams.has("email")).toBe(false);
  });
});
