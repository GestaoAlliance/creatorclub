import { describe, expect, it } from "vitest";
import { normalizeStoreUrl } from "@/lib/brands/manage";

describe("site da loja da marca", () => {
  it("completa https, tira a barra do fim e aceita vazio", () => {
    expect(normalizeStoreUrl("vermefree.com.br")).toBe("https://vermefree.com.br");
    expect(normalizeStoreUrl(" https://Botanikabrasil.com.br/ ")).toBe("https://botanikabrasil.com.br");
    expect(normalizeStoreUrl("https://loja.com.br/pt/")).toBe("https://loja.com.br/pt");
    expect(normalizeStoreUrl("")).toBeNull();
  });
  it("recusa endereço que não é site", () => {
    for (const bad of ["http://loja.com.br", "loja", "https://loja.com.br/?x=1", "javascript:alert(1)"]) {
      expect(() => normalizeStoreUrl(bad)).toThrow(/Site da loja inválido/);
    }
  });
});
