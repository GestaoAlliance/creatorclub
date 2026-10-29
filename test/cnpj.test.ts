import { describe, expect, it } from "vitest";
import { cnpjAddressLine, mustShipToCnpj, parseCnpjLookup, sameShipAddress, validateSignup } from "@/domain";
import { brasilApiLookup } from "@/lib/cnpj/lookup";

const API = {
  razao_social: "MARIA EXEMPLO LTDA",
  cep: "30140071",
  descricao_tipo_de_logradouro: "RUA",
  logradouro: "DAS ACACIAS",
  numero: "120",
  complemento: "SALA 2",
  bairro: "SAVASSI",
  municipio: "BELO HORIZONTE",
  uf: "mg",
  opcao_pelo_mei: false,
  descricao_situacao_cadastral: "ATIVA",
};

describe("cadastro PJ (D-PJADDR)", () => {
  it("lê a resposta da BrasilAPI e monta o endereço", () => {
    const info = parseCnpjLookup(API)!;
    expect(info).toMatchObject({ legalName: "MARIA EXEMPLO LTDA", mei: false, active: true });
    expect(info.address).toEqual({ zip: "30140071", street: "RUA DAS ACACIAS", number: "120", complement: "SALA 2", district: "SAVASSI", city: "BELO HORIZONTE", state: "MG" });
    expect(cnpjAddressLine(info.address)).toBe("RUA DAS ACACIAS, 120 — SALA 2, SAVASSI, BELO HORIZONTE/MG, CEP 30140-071");
    expect(parseCnpjLookup({ razao_social: "X" })).toBeNull();
    expect(parseCnpjLookup(null)).toBeNull();
  });

  it("só empresa que não é MEI precisa do endereço do CNPJ; mesmo endereço = CEP e número", () => {
    expect(mustShipToCnpj("11222333000181", "SIMPLES")).toBe(true);
    expect(mustShipToCnpj("11.222.333/0001-81", "OUTRO")).toBe(true);
    expect(mustShipToCnpj("11222333000181", "MEI")).toBe(false);
    expect(mustShipToCnpj("11222333000181", null)).toBe(false);
    expect(mustShipToCnpj(null, "SIMPLES")).toBe(false);
    expect(sameShipAddress({ zip: "30140-071", number: "120" }, { zip: "30140071", number: "0120" })).toBe(true);
    expect(sameShipAddress({ zip: "30140-071", number: "121" }, { zip: "30140071", number: "120" })).toBe(false);
  });

  it("consulta: 404 = não encontrado; erro ou rede = fora do ar; nada sai para a internet no teste", async () => {
    const f = (status: number, body: unknown) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
    expect(await brasilApiLookup(f(200, API))("11222333000181")).toMatchObject({ legalName: "MARIA EXEMPLO LTDA" });
    expect(await brasilApiLookup(f(404, {}))("11222333000181")).toBe("notfound");
    expect(await brasilApiLookup(f(500, {}))("11222333000181")).toBe("unavailable");
    expect(await brasilApiLookup((async () => { throw new TypeError("offline"); }) as unknown as typeof fetch)("11222333000181")).toBe("unavailable");
    expect(await brasilApiLookup(f(200, API))("123")).toBe("notfound");
  });

  it("no cadastro, CNPJ pede o regime; sem CNPJ o regime é ignorado", () => {
    const base = {
      fullName: "Maria Exemplo", cpf: "529.982.247-25", email: "m@x.com", phone: "(31) 99211-3232", instagram: "maria", coupon: "MARIA", payoutAs: "Empresa (CNPJ)", welcome: "1 produto",
      addrZip: "30140-071", addrStreet: "Rua X", addrNumber: "120", addrDistrict: "Savassi", addrCity: "Belo Horizonte", addrState: "MG",
    };
    const semRegime = validateSignup({ ...base, cnpj: "11.222.333/0001-81" });
    expect(!semRegime.ok && semRegime.errors.taxRegime).toBe("Escolha o regime do CNPJ.");
    const ok = validateSignup({ ...base, cnpj: "11.222.333/0001-81", taxRegime: "SIMPLES" });
    expect(ok.ok && ok.account.taxRegime).toBe("SIMPLES");
    expect(ok.ok && ok.answers["Regime tributário do CNPJ:"]).toBe("Simples Nacional (ME/EPP)");
    const pf = validateSignup({ ...base, payoutAs: "Pessoa física (CPF)", cnpj: "", taxRegime: "SIMPLES" });
    expect(pf.ok && pf.account.taxRegime).toBeNull();
  });
});
