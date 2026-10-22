import { describe, expect, it } from "vitest";
import { validateNewCouponCode } from "../src/domain";

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
