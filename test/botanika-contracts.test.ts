import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { renderContract, unknownContractFields } from "@/domain";

// D-BOTCONTRACT: os textos publicados pela migração usam só campos que o sistema preenche.
const sql = readFileSync("prisma/migrations/20261124090000_botanika_contracts/migration.sql", "utf8");
const bodies = [...sql.matchAll(/\$c\$([\s\S]*?)\$c\$/g)].map((m) => m[1]!);

describe("contratos da Botanika de 2026-11-17", () => {
  it("dois textos, sem campo desconhecido nem XXXX sobrando", () => {
    expect(bodies).toHaveLength(2);
    for (const body of bodies) {
      expect(unknownContractFields(body)).toEqual([]);
      expect(body).not.toMatch(/X{4,}|\[CUPOM\]/);
      const text = renderContract(body, {
        fullName: "Maria Exemplo", cpf: "52998224725", address: "Rua A, 1, Centro, Belo Horizonte/MG", cnpj: "11222333000181", companyName: "Maria LTDA",
        coupon: "MARIA", discountBps: 500, rateBps: 1500, releaseMinCents: 10_000, kitTiers: [], months: 6, videoGoal: 0, signedAt: new Date("2026-11-24T15:00:00Z"), instagram: "maria",
      });
      expect(text).not.toContain("{{");
      expect(text).toContain("titular do perfil @maria");
      expect(text).toContain("cupom MARIA");
    }
  });
});
