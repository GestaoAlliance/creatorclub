import { describe, expect, it } from "vitest";
import { suggestOwner, validateNewCouponCode } from "../src/domain";

describe("validateNewCouponCode", () => {
  it("aceita só letras, até 8, em maiúsculas", () => {
    expect(validateNewCouponCode("maria")).toEqual({ ok: true, code: "MARIA" });
    expect(validateNewCouponCode("  Giovana ")).toEqual({ ok: true, code: "GIOVANA" });
    expect(validateNewCouponCode("ABCDEFGH")).toEqual({ ok: true, code: "ABCDEFGH" });
  });

  it("remove acentos", () => {
    expect(validateNewCouponCode("joão")).toEqual({ ok: true, code: "JOAO" });
  });

  it("recusa números, espaços internos, símbolos, vazio e mais de 8", () => {
    expect(validateNewCouponCode("MARIA10")).toEqual({ ok: true, code: "MARIA10" });
    expect(validateNewCouponCode("ANA BEA")).toEqual({ ok: false, error: "CARACTERE_INVALIDO" });
    expect(validateNewCouponCode("ANA-B")).toEqual({ ok: false, error: "CARACTERE_INVALIDO" });
    expect(validateNewCouponCode("   ")).toEqual({ ok: false, error: "VAZIO" });
    expect(validateNewCouponCode("ABCDEFGHIJKLMNOPQRST")).toEqual({ ok: true, code: "ABCDEFGHIJKLMNOPQRST" });
    expect(validateNewCouponCode("ABCDEFGHIJKLMNOPQRSTU")).toEqual({ ok: false, error: "LONGO_DEMAIS" });
  });
});

describe("suggestOwner (D-COUPONBOARD)", () => {
  const people = [
    { id: "v", name: "Victoria Lima", instagram: "@vic.lima", tiktok: null },
    { id: "j", name: "Julia Souza", instagram: null, tiktok: "jujusouza" },
    { id: "j2", name: "Julia Prado", instagram: null, tiktok: null },
    { id: "a", name: "Ana", instagram: null, tiktok: null },
  ];
  it("acha pelo @ (com número no fim), pelo nome completo e pelo primeiro nome único", () => {
    expect(suggestOwner("VICLIMA10", people)?.id).toBe("v");
    expect(suggestOwner("JUJUSOUZA", people)?.id).toBe("j");
    expect(suggestOwner("JULIAPRADO", people)?.id).toBe("j2");
    expect(suggestOwner("VICTORIA15", people)?.id).toBe("v");
  });
  it("não chuta: empate, código curto demais ou nada parecido dá nulo", () => {
    expect(suggestOwner("JULIA10", people)).toBeNull();
    expect(suggestOwner("ANA10", people)?.id).toBe("a"); // nome inteiro igual vale mesmo curto
    expect(suggestOwner("BLACKFRIDAY", people)).toBeNull();
    expect(suggestOwner("AB", people)).toBeNull();
  });
});
