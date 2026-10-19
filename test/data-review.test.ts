import { describe, expect, it } from "vitest";
import { nameKey, nameProblems } from "@/domain";

describe("Cadastros a revisar", () => {
  it("acha linha de planilha colada no nome e nome de cupom", () => {
    expect(nameProblems("Angela Bruna Silva Cassiano David (31) 98450-5560 ANGELABRUNA https://botanikabrasil.com.br/discount/ANGELABRUNA 153.681")).toEqual(["dados-no-nome"]);
    expect(nameProblems("ANOVA10")).toEqual(["parece-cupom"]);
    expect(nameProblems("BARBIERI")).toEqual(["parece-cupom"]);
    expect(nameProblems("Ana Eliza Medeiros")).toEqual([]);
    expect(nameProblems("Dra. Paula")).toEqual([]);
  });
  it("compara nomes sem acento e sem de/da/do", () => {
    expect(nameKey("Ana Eliza de Medeiros")).toBe(nameKey("Ana Eliza Medeiros"));
    expect(nameKey("Luísa  Diniz")).toBe("luisa diniz");
    expect(nameKey("Ana Eliza")).not.toBe(nameKey("Ana Luiza"));
  });
});
