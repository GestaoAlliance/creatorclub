import { describe, expect, it } from "vitest";
import { brlInWords, receiptText } from "@/domain";

describe("recibo de pessoa física (D-PFRECEIPT)", () => {
  it("valor por extenso", () => {
    expect(brlInWords(152_809)).toBe("mil quinhentos e vinte e oito reais e nove centavos");
    expect(brlInWords(100)).toBe("um real");
    expect(brlInWords(1)).toBe("um centavo");
    expect(brlInWords(10_000)).toBe("cem reais");
    expect(brlInWords(12_345)).toBe("cento e vinte e três reais e quarenta e cinco centavos");
    expect(brlInWords(105_000)).toBe("mil e cinquenta reais");
    expect(brlInWords(120_000)).toBe("mil e duzentos reais");
    expect(brlInWords(2_150_000)).toBe("vinte e um mil e quinhentos reais");
    expect(brlInWords(100_000_000)).toBe("um milhão de reais");
    expect(brlInWords(0)).toBe("zero real");
  });

  it("texto do recibo", () => {
    const t = receiptText({
      fullName: " Maria Exemplo ",
      cpf: "52998224725",
      payerName: "BOTANIKA SAUDE NATURAL LTDA",
      payerDocument: "65.100.830/0001-36",
      brandName: "Botanika",
      amountCents: 80_000,
      releasedThrough: "2026-10",
      day: "2026-11-03",
    });
    expect(t).toContain("Eu, Maria Exemplo, CPF 529.982.247-25, declaro que recebo de BOTANIKA SAUDE NATURAL LTDA (CNPJ 65.100.830/0001-36)");
    expect(t).toMatch(/a quantia de R\$\s800,00 \(oitocentos reais\), referente às comissões de vendas do Creator Club Botanika liberadas até outubro de 2026/);
    expect(t.endsWith("3 de novembro de 2026")).toBe(true);
  });
});
