import { describe, expect, it } from "vitest";
import { allianceNav, hasAlliancePanel, staffNav } from "@/lib/staff/nav";

const labels = (role: "SUPER_ADMIN" | "GESTAO" | "ENVIO" | "PAGAMENTO" | "HUNTER", brandId: string | null = "b") =>
  staffNav([{ role, brandId }]).map((i) => i.label);

describe("menu da equipe por papel", () => {
  it("cada papel vê só o que pode usar", () => {
    expect(labels("SUPER_ADMIN", null)).toEqual(["Início", "Candidatas", "Creators", "Desempenho", "Vendas", "Hunters", "Cupons", "Envios", "Saques", "Abertura", "Termo", "Contratos", "Shopify", "Importar"]);
    expect(labels("GESTAO")).toEqual(["Início", "Candidatas", "Creators", "Desempenho", "Vendas", "Hunters", "Cupons", "Envios"]);
    expect(labels("ENVIO")).toEqual(["Início", "Envios"]);
    expect(labels("PAGAMENTO")).toEqual(["Início", "Candidatas", "Creators", "Vendas", "Saques", "Abertura"]);
    expect(labels("HUNTER")).toEqual(["Início", "Minhas indicações"]);
  });

  it("A1: painel da Alliance para super admin ou quem atende mais de uma marca; menu da Alliance", () => {
    expect(hasAlliancePanel([{ role: "SUPER_ADMIN", brandId: null }], 1)).toBe(true);
    expect(hasAlliancePanel([{ role: "GESTAO", brandId: "a" }], 1)).toBe(false);
    expect(hasAlliancePanel([{ role: "GESTAO", brandId: "a" }, { role: "GESTAO", brandId: "b" }], 2)).toBe(true);
    expect(allianceNav([{ role: "SUPER_ADMIN", brandId: null }]).map((i) => i.label)).toEqual(["Marcas da Alliance", "Cadastro de marcas", "Equipe"]);
    expect(allianceNav([{ role: "GESTAO", brandId: "a" }]).map((i) => i.label)).toEqual(["Marcas da Alliance"]);
    expect(staffNav([{ role: "ENVIO", brandId: "a" }])[0]).toEqual({ href: "/marca", label: "Início", icon: "home" });
  });
});
