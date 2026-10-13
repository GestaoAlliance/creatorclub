import { describe, expect, it } from "vitest";
import { addressOf, AddressError, formatAddress, normalizeAddress, partialAddressText, zipFromText } from "@/lib/shipments/address";
import { trackingUrl } from "@/lib/shipments/shipments";

const ok = { zip: "01310-100", street: "  Av.   Paulista ", number: "1000", complement: "", district: "Bela Vista", city: "São Paulo", state: "sp" };

describe("endereço da creator", () => {
  it("normaliza CEP, UF e espaços; complemento vazio vira null", () => {
    expect(normalizeAddress(ok)).toEqual({ zip: "01310100", street: "Av. Paulista", number: "1000", complement: null, district: "Bela Vista", city: "São Paulo", state: "SP" });
  });

  it("recusa CEP curto, UF inexistente e campos obrigatórios vazios", () => {
    expect(() => normalizeAddress({ ...ok, zip: "1234" })).toThrow(AddressError);
    expect(() => normalizeAddress({ ...ok, state: "XX" })).toThrow(/estado/);
    expect(() => normalizeAddress({ ...ok, street: " " })).toThrow(/rua/);
    expect(() => normalizeAddress({ ...ok, number: "" })).toThrow(/número/);
    expect(() => normalizeAddress({ ...ok, district: "" })).toThrow(/bairro/);
    expect(() => normalizeAddress({ ...ok, city: "" })).toThrow(/cidade/);
  });

  it("endereço da ficha só conta completo; formata em três linhas", () => {
    const cols = { addrZip: "01310100", addrStreet: "Av. Paulista", addrNumber: "1000", addrComplement: "ap 12", addrDistrict: "Bela Vista", addrCity: "São Paulo", addrState: "SP" };
    expect(addressOf({ ...cols, addrCity: null })).toBeNull();
    expect(formatAddress(addressOf(cols)!)).toEqual(["Av. Paulista, 1000 — ap 12", "Bela Vista · São Paulo/SP", "CEP 01310-100"]);
    // Envio importado das planilhas (D-SHIPIMPORT): o endereço é o texto livre da planilha.
    expect(formatAddress({ raw: "Rua X, 10 - Centro, Cidade/UF" })).toEqual(["Rua X, 10 - Centro, Cidade/UF"]);
  });
});

describe("link de rastreio", () => {
  it("Correios (formato AA123456789BR) ganha link; outros códigos e transportadoras não", () => {
    expect(trackingUrl("Correios", "aa123456789br")).toBe("https://rastreamento.correios.com.br/app/index.php?objeto=AA123456789BR");
    expect(trackingUrl(null, "AA123456789BR")).toContain("objeto=AA123456789BR");
    expect(trackingUrl("Jadlog", "AA123456789BR")).toBeNull();
    expect(trackingUrl("Correios", "12345")).toBeNull();
    expect(trackingUrl("Correios", null)).toBeNull();
  });
});

describe("endereço informado (D-ADDRINFORMED)", () => {
  const empty = { addrZip: null, addrStreet: null, addrNumber: null, addrComplement: null, addrDistrict: null, addrCity: null, addrState: null };

  it("endereço da carga numa linha só vira texto; completo ou vazio não", () => {
    expect(partialAddressText({ ...empty, addrStreet: "Rua A, 10, Centro, Belo Horizonte - MG, 30140-071" })).toBe("Rua A, 10, Centro, Belo Horizonte - MG, 30140-071");
    expect(partialAddressText({ ...empty, addrStreet: "Rua B 5", addrCity: "Recife", addrState: "PE" })).toBe("Rua B 5, Recife/PE");
    expect(partialAddressText(empty)).toBeNull();
    const full = { addrZip: "30140071", addrStreet: "Rua A", addrNumber: "10", addrComplement: null, addrDistrict: "Centro", addrCity: "BH", addrState: "MG" };
    expect(partialAddressText(full)).toBeNull();
  });

  it("acha o CEP no texto, com ou sem traço", () => {
    expect(zipFromText("Rua A, 10 - CEP 30140-071")).toBe("30140071");
    expect(zipFromText("Rua A 30140071 BH")).toBe("30140071");
    expect(zipFromText("Rua A, 10, telefone 31999998888")).toBeNull();
    expect(zipFromText(null)).toBeNull();
  });
});
