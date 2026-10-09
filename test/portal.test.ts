import { describe, expect, it } from "vitest";
import { brandCssVars } from "../src/lib/portal/context";

describe("cor da marca no portal (D-BRANDCOLOR)", () => {
  it("usa as cores do banco e cai na principal quando não há secundária", () => {
    expect(brandCssVars({ primaryColor: "#323C91", secondaryColor: "#C4D78A" })).toEqual({ "--brand": "#323C91", "--brand-2": "#C4D78A" });
    expect(brandCssVars({ primaryColor: "#323C91", secondaryColor: null })).toEqual({ "--brand": "#323C91", "--brand-2": "#323C91" });
  });

  it("nunca injeta CSS: valor fora de #RRGGBB vira o neutro", () => {
    expect(brandCssVars({ primaryColor: "red;}body{display:none", secondaryColor: "url(x)" })).toEqual({ "--brand": "#18181B", "--brand-2": "#18181B" });
  });
});
