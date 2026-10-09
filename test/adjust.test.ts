import { describe, expect, it } from "vitest";
import { brlToCents } from "@/lib/commission/adjust";

describe("valor do ajuste em reais", () => {
  it("aceita formatos brasileiros com sinal, sem Float", () => {
    expect(brlToCents("150")).toBe(15_000);
    expect(brlToCents("150,5")).toBe(15_050);
    expect(brlToCents("-20,50")).toBe(-2_050);
    expect(brlToCents("R$ 1.234,56")).toBe(123_456);
    expect(brlToCents("0,01")).toBe(1);
  });

  it("recusa texto, três casas e separador errado", () => {
    for (const bad of ["", "abc", "10,555", "1,234.56", "--5"]) expect(() => brlToCents(bad)).toThrow();
  });
});
