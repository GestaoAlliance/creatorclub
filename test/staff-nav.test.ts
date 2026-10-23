import { describe, expect, it } from "vitest";
import { activeTab, allianceNav, hasAlliancePanel, inAllBrands, staffNav } from "@/lib/staff/nav";

const labels = (role: "SUPER_ADMIN" | "GESTAO" | "ENVIO" | "PAGAMENTO" | "HUNTER", brandId: string | null = "b") =>
  staffNav([{ role, brandId }]).map((i) => i.label);

describe("menu da equipe por papel", () => {
  it("cada papel vê só o que pode usar, em grupos com abas (D-MENUGROUPS)", () => {
    expect(labels("SUPER_ADMIN", null)).toEqual(["Início", "Creators", "Hunters", "Vendas", "Pagamentos", "Envios", "Configurações"]);
    // M1.1 (D-WDAPPROVE): a Gestão aprova saques, então vê Pagamentos (só a aba Saques).
    expect(labels("GESTAO")).toEqual(["Início", "Creators", "Hunters", "Vendas", "Pagamentos", "Envios"]);
    expect(labels("ENVIO")).toEqual(["Início", "Envios"]);
    expect(labels("PAGAMENTO")).toEqual(["Início", "Creators", "Vendas", "Pagamentos"]);
    expect(labels("HUNTER")).toEqual(["Início", "Minhas indicações"]);
    const tabs = (role: "SUPER_ADMIN" | "GESTAO" | "PAGAMENTO", label: string) =>
      staffNav([{ role, brandId: role === "SUPER_ADMIN" ? null : "b" }]).find((i) => i.label === label)?.tabs?.map((t) => t.label);
    expect(tabs("SUPER_ADMIN", "Creators")).toEqual(["Creators", "Candidatas", "Ações"]);
    expect(tabs("SUPER_ADMIN", "Configurações")).toEqual(["Marcas", "Equipe", "Contratos", "Termo", "Shopify", "Importar"]);
    // Cada papel só vê as abas que pode usar; o item do menu abre a primeira delas.
    expect(tabs("PAGAMENTO", "Creators")).toEqual(["Creators", "Candidatas"]);
    expect(tabs("PAGAMENTO", "Vendas")).toEqual(["Vendas", "Produtos"]);
    expect(tabs("GESTAO", "Vendas")).toEqual(["Vendas", "Produtos", "Cupons", "Desempenho"]);
    expect(tabs("GESTAO", "Pagamentos")).toEqual(["Saques"]);
    expect(staffNav([{ role: "GESTAO", brandId: "b" }]).find((i) => i.label === "Vendas")?.href).toBe("/vendas");
  });

  it("aba aberta: a mais específica para o caminho", () => {
    const tabs = [{ href: "/saques" }, { href: "/abertura" }, { href: "/saques/conferencia" }];
    expect(activeTab(tabs, "/admin/saques")).toBe("/saques");
    expect(activeTab(tabs, "/admin/saques/conferencia")).toBe("/saques/conferencia");
    expect(activeTab(tabs, "/admin/saques/nf/123")).toBe("/saques");
    expect(activeTab(tabs, "/admin/vendas")).toBeNull();
  });

  it("A1: painel da Alliance para super admin ou quem atende mais de uma marca; menu da Alliance", () => {
    expect(hasAlliancePanel([{ role: "SUPER_ADMIN", brandId: null }], 1)).toBe(true);
    expect(hasAlliancePanel([{ role: "GESTAO", brandId: "a" }], 1)).toBe(false);
    expect(hasAlliancePanel([{ role: "GESTAO", brandId: "a" }, { role: "GESTAO", brandId: "b" }], 2)).toBe(true);
    expect(allianceNav([{ role: "SUPER_ADMIN", brandId: null }]).map((i) => i.label)).toEqual(["Início", "Configurações"]);
    expect(allianceNav([{ role: "GESTAO", brandId: "a" }]).map((i) => i.label)).toEqual(["Início"]);
    // Configurações de "Todas as marcas" abre Marcas com as três; dentro de uma marca, Marcas mostra só ela.
    expect(allianceNav([{ role: "SUPER_ADMIN", brandId: null }])[1]!.href).toBe("/marcas?todas=1");
    expect([inAllBrands("/admin", null), inAllBrands("/admin/marcas", "1"), inAllBrands("/admin/marcas", null), inAllBrands("/admin/vendas", "1")]).toEqual([true, true, false, false]);
    expect(staffNav([{ role: "ENVIO", brandId: "a" }])[0]).toEqual({ href: "/marca", label: "Início", icon: "home" });
  });
});
