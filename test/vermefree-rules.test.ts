import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { contractEndDay, renderContract, tierProducts, unknownContractFields } from "@/domain";
import { welcomeWithoutKit } from "@/lib/onboarding/applications";

// D-VFRULES (contratos e distratos de 2026-11-24).
const sql = readFileSync("prisma/migrations/20261212090000_vermefree_contracts/migration.sql", "utf8");
const bodies = [...sql.matchAll(/\$c\$([\s\S]*?)\$c\$/g)].map((m) => m[1]!);
const data = {
  fullName: "Maria Exemplo", cpf: "52998224725", address: "Rua A, 1, Centro, Itajaí/SC", cnpj: null, companyName: null, coupon: "MARIA", discountBps: 500, rateBps: 1000,
  releaseMinCents: 10_000, kitTiers: [], months: 0, videoGoal: 0, signedAt: new Date("2026-11-24T15:00:00Z"), email: "maria@x.com", contractStartDay: "2026-08-01", endDay: "2026-12-15",
};

describe("VermeFree: contratos novos, distratos e regras (D-VFRULES)", () => {
  it("4 textos só com campos conhecidos, sem ${…} nem XXXX", () => {
    expect(bodies).toHaveLength(4);
    for (const b of bodies) {
      expect(unknownContractFields(b)).toEqual([]);
      expect(b).not.toMatch(/\$\{|X{4,}|\[NOME/);
      expect(renderContract(b, data)).not.toContain("{{");
    }
    const distrato = renderContract(bodies[2]!, data);
    expect(distrato).toContain("Maria Exemplo, inscrita no CPF sob o nº 529.982.247-25");
    expect(distrato).toContain("endereço eletrônico maria@x.com");
    expect(distrato).toContain("a partir de 15 de dezembro de 2026");
  });

  it("1 produto com R$ 2.000 no mês, sem tabela dos primeiros meses", () => {
    expect(tierProducts(199_999, true, "vermefree")).toBe(0);
    expect(tierProducts(200_000, true, "vermefree")).toBe(1);
    expect(tierProducts(1_500_000, false, "vermefree")).toBe(1);
    expect(tierProducts(100_000, false, "botanika")).toBe(1); // Botanika segue a tabela dela
  });

  it("prazo indeterminado não tem fim; a aprovação sem a opção de 2 produtos", () => {
    expect(contractEndDay("2026-11-24", 0)).toBeNull();
    expect(contractEndDay("2026-11-24", 6)).toBe("2027-05-24");
    expect(welcomeWithoutKit({ welcomeOneIds: [], welcomeTwoIds: [], welcomeTwoOffered: false })).toBe(true);
    expect(welcomeWithoutKit({ welcomeOneIds: [], welcomeTwoIds: [], welcomeTwoOffered: true })).toBe(false);
    expect(welcomeWithoutKit({ welcomeOneIds: ["gel"], welcomeTwoIds: [] })).toBe(true); // Revita
  });
});
