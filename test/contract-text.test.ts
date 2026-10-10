import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { kitText, renderContract, unknownContractFields, type ContractData } from "@/domain";

const base: ContractData = {
  fullName: "Maria Exemplo",
  cpf: "52998224725",
  address: "Rua A, 1, Centro, São Paulo/SP",
  cnpj: null,
  companyName: null,
  coupon: "MARIA",
  discountBps: 500,
  rateBps: 1500,
  releaseMinCents: 50_000,
  kitTiers: [{ fromCents: 100_000, products: 1 }, { fromCents: 200_000, products: 2 }, { fromCents: 1_000_000, products: 3 }],
  months: 6,
  videoGoal: 9,
  signedAt: new Date("2026-10-10T15:00:00Z"),
};

describe("contrato preenchido (D-SIGNCONTRACT)", () => {
  it("pessoa física e com CNPJ; cupom, taxa, mínimo, prazo, data", () => {
    const body = "{{CONTRATADA}} | {{CUPOM}} {{DESCONTO}} {{COMISSAO}} {{MINIMO}} {{MESES}} {{VIDEOS}} {{DATA}} {{OUTRO}}";
    expect(renderContract(body, base)).toBe(
      "Maria Exemplo, inscrita no CPF sob o nº 529.982.247-25, residente em Rua A, 1, Centro, São Paulo/SP | MARIA 5% 15% R$ 500,00 06 (seis) meses 09 (nove) 10 de outubro de 2026 {{OUTRO}}",
    );
    const pj = renderContract("{{CONTRATADA}}", { ...base, cnpj: "11222333000181", companyName: "Maria Conteúdo LTDA" });
    expect(pj).toBe("Maria Conteúdo LTDA, inscrita no CNPJ sob o nº 11.222.333/0001-81, com endereço em Rua A, 1, Centro, São Paulo/SP, neste ato representada por Maria Exemplo, inscrita no CPF sob o nº 529.982.247-25");
    expect(renderContract("{{COMISSAO}}", { ...base, rateBps: 1250 })).toBe("12,5%");
    expect(unknownContractFields("{{NOME}} {{ NOME }} {{CUPON}} {{X}}")).toEqual(["CUPON", "X"]);
  });

  it("faixas do kit em linhas, com e sem teto; sem faixas", () => {
    expect(kitText(base.kitTiers)).toBe([
      "Vendas do mês abaixo de R$ 1.000,00: sem novo kit;",
      "Vendas do mês de R$ 1.000,00 a R$ 1.999,99: 01 (um) suplemento;",
      "Vendas do mês de R$ 2.000,00 a R$ 9.999,99: 02 (dois) suplementos;",
      "Vendas do mês a partir de R$ 10.000,00: 03 (três) suplementos.",
    ].join("\n"));
    expect(kitText([{ fromCents: 400_000, toCents: 999_999, products: 2 }])).toContain("de R$ 4.000,00 até R$ 9.999,99: 02 (dois) suplementos.");
    expect(kitText([])).toBe("Esta versão do contrato não tem kit mensal.");
  });

  it("os textos da migração só usam campos conhecidos e não sobram marcas do modelo do Word", () => {
    const dir = readdirSync("prisma/migrations").find((d) => d.endsWith("_contract_signature"))!;
    const sql = readFileSync(`prisma/migrations/${dir}/migration.sql`, "utf8");
    const bodies = [...sql.matchAll(/\$contrato\$([\s\S]*?)\$contrato\$/g)].map((m) => m[1]!);
    expect(bodies).toHaveLength(3);
    for (const b of bodies) {
      expect(unknownContractFields(b)).toEqual([]);
      expect(b).not.toMatch(/xxxx|XXXX|\[RAZÃO|\[nome|TESTEMUNHA|dia 15/i);
      expect(renderContract(b, base)).not.toMatch(/\{\{/);
    }
  });
});
