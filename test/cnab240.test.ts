import { describe, expect, it } from "vitest";
import { alfa, buildRemessa, checkRemessa, pixKeyOf, type CnabCompany, type CnabPayment } from "@/domain";

const company: CnabCompany = { cnpj: "65.100.830/0001-36", name: "Botânica Brasil Ltda", convenio: "123456", agency: "3069", agencyDv: "0", account: "12345", accountDv: "6" };
const pay = (o: Partial<CnabPayment> = {}): CnabPayment => ({ id: "a1b2c3d4-0000-0000-0000-000000000001", name: "Maria José", doc: "11222333000181", pixKey: "maria@exemplo.com", amountCents: 12_345, ...o });
const NOW = new Date("2026-10-28T18:30:15Z");

describe("remessa SICOOB CNAB 240 Pix (D-REMESSA)", () => {
  it("tipo da chave Pix", () => {
    expect(pixKeyOf("Maria@Exemplo.com")).toEqual({ kind: "02", value: "maria@exemplo.com" });
    expect(pixKeyOf("+55 (31) 99211-3232")).toEqual({ kind: "01", value: "+5531992113232" });
    expect(pixKeyOf("529.982.247-25")).toEqual({ kind: "03", value: "52998224725" });
    expect(pixKeyOf("11.222.333/0001-81")).toEqual({ kind: "03", value: "11222333000181" });
    expect(pixKeyOf("123e4567-e89b-12d3-a456-426614174000")).toEqual({ kind: "04", value: "123e4567-e89b-12d3-a456-426614174000" });
    expect(pixKeyOf("(31) 3211-3239")).toEqual({ kind: "01", value: "+553132113239" });
    expect(pixKeyOf("abc")).toBeNull();
    expect(pixKeyOf("")).toBeNull();
  });

  it("arquivo com header, lote, A+B por saque e trailers; 240 posições; totais certos", () => {
    const file = buildRemessa({ company, payments: [pay(), pay({ id: "a1b2c3d4-0000-0000-0000-000000000002", doc: "52998224725", pixKey: "529.982.247-25", amountCents: 100 })], payDay: "2026-11-20", nsa: 7, now: NOW, today: "2026-10-28" });
    expect(file.endsWith("\r\n")).toBe(true);
    const l = file.slice(0, -2).split("\r\n");
    expect(l).toHaveLength(8);
    for (const x of l) expect(x).toHaveLength(240);
    const at = (s: string, from: number, to: number) => s.slice(from - 1, to);
    // Header do arquivo
    expect(at(l[0]!, 1, 8)).toBe("75600000");
    expect(at(l[0]!, 19, 32)).toBe("65100830000136");
    expect(at(l[0]!, 33, 52)).toBe("123456".padEnd(20));
    expect(at(l[0]!, 73, 102)).toBe("BOTANICA BRASIL LTDA".padEnd(30));
    expect(at(l[0]!, 143, 166)).toBe("1" + "28102026" + "153015" + "000007" + "087");
    // Header do lote: crédito, fornecedor, Pix 45, layout 045
    expect(at(l[1]!, 1, 16)).toBe("75600011C2045045");
    // Segmento A
    expect(at(l[2]!, 9, 14)).toBe("00001A");
    expect(at(l[2]!, 18, 20)).toBe("009");
    expect(at(l[2]!, 44, 73)).toBe("MARIA JOSE".padEnd(30));
    expect(at(l[2]!, 94, 104)).toBe("20112026BRL");
    expect(at(l[2]!, 120, 134)).toBe("000000000012345");
    expect(at(l[2]!, 216, 217)).toBe("01");
    // Segmento B: e-mail (02), PJ, chave em 128-226
    expect(at(l[3]!, 14, 18)).toBe("B02 2");
    expect(at(l[3]!, 19, 32)).toBe("11222333000181");
    expect(at(l[3]!, 128, 226).trimEnd()).toBe("maria@exemplo.com");
    // Segundo saque: chave CPF (03) vai no número de inscrição; PF
    expect(at(l[5]!, 14, 18)).toBe("B03 1");
    expect(at(l[5]!, 19, 32)).toBe("00052998224725");
    // Trailer do lote: 6 registros, total R$ 124,45
    expect(at(l[6]!, 1, 8)).toBe("75600015");
    expect(at(l[6]!, 18, 23)).toBe("000006");
    expect(at(l[6]!, 24, 41)).toBe("000000000000012445");
    // Trailer do arquivo: 1 lote, 8 registros
    expect(at(l[7]!, 1, 29)).toBe("75699999" + " ".repeat(9) + "000001" + "000008");
  });

  it("confere tudo antes: dados da marca, data, valor, chave, CPF/CNPJ e repetidos", () => {
    const problems = checkRemessa({ ...company, convenio: "", account: "x" }, [pay({ amountCents: 0 }), pay({ pixKey: "abc", doc: "123" })], "2026-10-01", "2026-10-28");
    const text = problems.map((p) => p.problem).join(" | ");
    for (const s of ["convênio", "Conta da marca", "passado", "positivo", "Chave Pix", "CPF/CNPJ", "repetido"]) expect(text).toContain(s);
    expect(() => buildRemessa({ company, payments: [], payDay: "2026-11-20", nsa: 1, now: NOW, today: "2026-10-28" })).toThrow(/Nenhum saque/);
    expect(alfa("Ação & Cia", 10)).toBe("ACAO CIA  ");
  });
});
