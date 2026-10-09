import { describe, expect, it } from "vitest";
import { DEFAULT_AFTER_LOGIN, normalizeEmail, passwordProblem, safeNextPath } from "@/lib/auth/rules";

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
