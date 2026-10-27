import { describe, expect, it } from "vitest";
import { brPhoneDigits, formatBrPhone, validBrPhone } from "@/domain";

describe("telefone brasileiro (D-PHONE)", () => {
  it("tira o +55 do país digitado junto com o DDD", () => {
    expect(formatBrPhone("+55 31 92113-2390")).toBe("(31) 92113-2390");
    expect(formatBrPhone("5531921132390")).toBe("(31) 92113-2390");
    expect(formatBrPhone("553132113239")).toBe("(31) 3211-3239");
    expect(brPhoneDigits("031 92113-2390")).toBe("31921132390");
  });

  it("DDD 55 (RS) sem o código do país continua valendo", () => {
    expect(formatBrPhone("55991234567")).toBe("(55) 99123-4567");
    expect(validBrPhone("(55) 99123-4567")).toBe("(55) 99123-4567");
  });

  it("enquanto digita, mostra o que já tem", () => {
    expect(formatBrPhone("3")).toBe("(3");
    expect(formatBrPhone("3192")).toBe("(31) 92");
    expect(formatBrPhone("")).toBe("");
  });

  it("só aceita DDD + 8 ou 9 dígitos", () => {
    expect(validBrPhone("+55 (31) 92113-2390")).toBe("(31) 92113-2390");
    expect(validBrPhone("(31) 3211-3239")).toBe("(31) 3211-3239");
    expect(validBrPhone("9211-3239")).toBeNull();
    expect(validBrPhone("44 31 92113-2390")).toBeNull();
    expect(validBrPhone("55 31 92113-2390 12")).toBeNull();
  });
});
