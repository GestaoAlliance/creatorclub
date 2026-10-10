import { describe, expect, it } from "vitest";
import { isValidCpf, maskCpf } from "@/lib/terms/terms";

describe("CPF do aceite", () => {
  it("aceita CPF válido com ou sem pontuação; recusa dígito errado, curto e repetido", () => {
    expect(isValidCpf("529.982.247-25")).toBe(true);
    expect(isValidCpf("52998224725")).toBe(true);
    expect(isValidCpf("529.982.247-24")).toBe(false);
    expect(isValidCpf("5299822472")).toBe(false);
    expect(isValidCpf("111.111.111-11")).toBe(false);
  });
  it("mascara o CPF para a equipe", () => {
    expect(maskCpf("52998224725")).toBe("***.982.247-**");
  });
});
