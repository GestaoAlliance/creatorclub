import { describe, expect, it } from "vitest";
import { checkNf, issuerFromAccessKey, parseNfseText } from "@/domain";

// Texto no formato do DANFSe v2.0 (NFS-e padrão nacional), com dados fictícios. Tomadora: CNPJ da Botanika.
const KEY = "31062002211222333000181000000000001226080590551396";
const danfse = (o: { taker?: string; issuer?: string; amount?: string; code?: string } = {}) => `DATA CIENTIFICAÇÃO: IDENTIFICAÇÃO E ASSINATURA N° NFS-e / CHAVE NFS-e
12 / ${KEY}
DANFSe v2.0
CHAVE DE ACESSO DA NFS-e
${KEY}
PRESTADOR / FORNECEDOR CNPJ / CPF / NIF
${o.issuer ?? "11.222.333/0001-81"}
Nome / Nome Empresarial
CREATOR EXEMPLO LTDA
TOMADOR / ADQUIRENTE CNPJ / CPF / NIF
${o.taker ?? "65.100.830/0001-36"}
Nome / Nome Empresarial
BOTANIKA SAUDE NATURAL LTDA
SERVIÇO PRESTADO Código de Tributação Nacional/Municipal
${o.code ?? "17.06.01 / 001"}
VALOR TOTAL DA NFS-e VALOR DA OPERAÇÃO / SERVIÇO
${o.amount ?? "R$ 1.528,09"}
VALOR LÍQUIDO DA NFS-e
R$ 1.528,09`;

const expected = { takerDoc: "65.100.830/0001-36", takerName: "Botanika", amountCents: 152_809, issuerDoc: "11222333000181" };

describe("conferência da NF do saque (D-NFCHECK)", () => {
  it("lê chave, emissor, tomadora, código e valor do DANFSe", () => {
    expect(parseNfseText(danfse())).toEqual({ accessKey: KEY, issuerDoc: "11222333000181", takerDoc: "65100830000136", serviceCode: "17.06.01", amountCents: 152_809 });
    expect(issuerFromAccessKey(KEY)).toBe("11222333000181");
  });

  it("nota certa passa; CNPJ da creator vazio na ficha também passa (o da nota vai para a ficha)", () => {
    expect(checkNf(parseNfseText(danfse()), expected)).toMatchObject({ status: "OK", problems: [] });
    expect(checkNf(parseNfseText(danfse()), { ...expected, issuerDoc: null })).toMatchObject({ status: "OK", problems: [], issuerDoc: "11222333000181" });
  });

  it("tomadora, valor, emissor e código diferentes bloqueiam com o motivo", () => {
    const r = (o: Parameters<typeof danfse>[0]) => checkNf(parseNfseText(danfse(o)), expected).problems;
    expect(r({ taker: "12.345.678/0001-95" })).toEqual([expect.stringMatching(/tomadora da nota precisa ser a Botanika/)]);
    expect(r({ amount: "R$ 1.500,00" })).toEqual([expect.stringMatching(/R\$\s1\.500,00.*R\$\s1\.528,09/)]);
    expect(r({ issuer: "99.888.777/0001-66" })).toEqual([expect.stringMatching(/CNPJ diferente/)]);
    expect(r({ code: "01.07.00 / 001" })).toEqual([expect.stringMatching(/17\.06/)]);
  });

  it("PDF sem texto (foto, escaneado) ou fora do padrão: passa marcado para conferir", () => {
    expect(checkNf(parseNfseText(""), expected)).toMatchObject({ status: "MANUAL", problems: [] });
    expect(checkNf(parseNfseText("NOTA FISCAL DE SERVIÇOS ELETRÔNICA\nPrefeitura de Algum Lugar\nValor R$ 1.528,09"), expected)).toMatchObject({ status: "MANUAL" });
  });
});

describe("leitura do PDF da nota", () => {
  it("extrai o texto de um PDF e confere", async () => {
    const { pdfText } = await import("@/lib/withdrawals/nf");
    const { danfseLines, makePdf } = await import("./nf-pdf");
    const pdf = makePdf(danfseLines({ key: KEY, issuer: "11.222.333/0001-81", taker: "65.100.830/0001-36", amount: "R$ 1.528,09" }));
    expect(checkNf(parseNfseText(await pdfText(pdf)), expected)).toMatchObject({ status: "OK", problems: [] });
    expect(await pdfText(new TextEncoder().encode("%PDF-1.4 quebrado"))).toBe("");
  });
});
