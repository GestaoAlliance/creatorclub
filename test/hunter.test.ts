import { describe, expect, it } from "vitest";
import { formUrlFor, hunterCodeFrom, isValidFormTemplate, isValidHunterCode, normalizeHunterCode } from "@/domain";

describe("link do hunter (D-HUNTERLINK)", () => {
  it("código: sem acento, minúsculas, só letras e números", () => {
    expect(normalizeHunterCode("  Ána-Lú 2 ")).toBe("analu2");
    expect(hunterCodeFrom("Júlia Exemplo da Silva")).toBe("julia");
    expect(isValidHunterCode("ana")).toBe(true);
    expect(isValidHunterCode("a")).toBe(false);
    expect(isValidHunterCode("x".repeat(21))).toBe(false);
  });

  it("link pré-preenchido precisa ser do Google Forms e ter CODIGO", () => {
    const t = "https://docs.google.com/forms/d/e/abc/viewform?usp=pp_url&entry.123=CODIGO";
    expect(isValidFormTemplate(t)).toBe(true);
    expect(isValidFormTemplate("https://docs.google.com/forms/d/e/abc/viewform")).toBe(false);
    expect(isValidFormTemplate("https://exemplo.com/?x=CODIGO")).toBe(false);
    expect(formUrlFor(t, "ana")).toBe("https://docs.google.com/forms/d/e/abc/viewform?usp=pp_url&entry.123=ana");
    expect(formUrlFor(t, null)).toBe("https://docs.google.com/forms/d/e/abc/viewform?usp=pp_url&entry.123=");
  });
});
