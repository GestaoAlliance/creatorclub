import { describe, expect, it } from "vitest";
import { addressOf, AddressError, formatAddress, normalizeAddress } from "@/lib/shipments/address";
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
