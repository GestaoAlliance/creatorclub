import { describe, expect, it } from "vitest";
import { staffNav } from "@/lib/staff/nav";

const labels = (role: "SUPER_ADMIN" | "GESTAO" | "ENVIO" | "PAGAMENTO" | "HUNTER", brandId: string | null = "b") =>
  staffNav([{ role, brandId }]).map((i) => i.label);

describe("menu da equipe por papel", () => {
  it("cada papel vê só o que pode usar", () => {
    expect(labels("SUPER_ADMIN", null)).toEqual(["Início", "Creators", "Cupons", "Envios", "Saques", "Abertura", "Equipe", "Termo", "Shopify", "Importar"]);
    expect(labels("GESTAO")).toEqual(["Início", "Creators", "Cupons", "Envios"]);
    expect(labels("ENVIO")).toEqual(["Início", "Envios"]);
    expect(labels("PAGAMENTO")).toEqual(["Início", "Creators", "Saques", "Abertura"]);
    expect(labels("HUNTER")).toEqual(["Início"]);
  });
});
