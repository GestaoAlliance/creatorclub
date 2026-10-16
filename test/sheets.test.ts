import { describe, expect, it } from "vitest";
import { centralTab, cleanInstagram, formatDoc, normHeader, parseCityState, parseSheetDay, parseYesNo, sheetDay, tabForCategories, yesNo } from "@/domain";

describe("planilhas: leitura das colunas (D-SHEETSYNC)", () => {
  it("títulos sem acento e abas da Central", () => {
    expect(normHeader("  Seguimos no  insta? ")).toBe("SEGUIMOS NO INSTA?");
    expect(normHeader("ENDEREÇO")).toBe("ENDERECO");
    expect(centralTab("CREATORS")).toBe("CREATORS");
    expect(centralTab("UGC`S")).toBe("UGC");
    expect(centralTab("Prescritores")).toBe("PRESCRITORES");
    expect(centralTab("Prospecção Hunter")).toBeNull();
    expect(tabForCategories(["UGC", "PRESCRITOR"])).toBe("PRESCRITORES");
    expect(tabForCategories(["UGC"])).toBe("UGC");
    expect(tabForCategories([])).toBe("CREATORS");
  });

  it("Sim/Não, datas, cidade/UF, @ e documentos", () => {
    expect([parseYesNo("Sim"), parseYesNo("não"), parseYesNo(""), parseYesNo("talvez")]).toEqual([true, false, null, null]);
    expect([yesNo(true), yesNo(false), yesNo(null)]).toEqual(["Sim", "Não", ""]);
    expect(parseSheetDay("2026-10-05")).toBe("2026-10-05");
    expect(parseSheetDay("5/10/26")).toBe("2026-10-05");
    expect(parseSheetDay("31/02/2026")).toBeNull();
    expect(sheetDay("2026-10-05")).toBe("05/10/2026");
    expect(parseCityState("Imperatriz/MA")).toEqual({ city: "Imperatriz", state: "MA" });
    expect(parseCityState("Betim - mg")).toEqual({ city: "Betim", state: "MG" });
    expect(parseCityState("São Paulo")).toEqual({ city: "São Paulo", state: null });
    expect(cleanInstagram("https://instagram.com/ana.x/")).toBe("ana.x");
    expect(cleanInstagram("@@ana")).toBe("ana");
    expect(formatDoc("52998224725")).toBe("529.982.247-25");
    expect(formatDoc("11222333000181")).toBe("11.222.333/0001-81");
  });
});
