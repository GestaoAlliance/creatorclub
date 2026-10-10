import { describe, expect, it } from "vitest";
import { filterApplications, findDuplicates, parseFollowers } from "@/domain";

describe("organização das candidatas (F2)", () => {
  it("lê o número de seguidores do jeito que as pessoas escrevem", () => {
    const cases: [string, number | null][] = [
      ["12 mil", 12_000], ["12k", 12_000], ["1,5 mil", 1_500], ["1.5k", 1_500], ["1.500", 1_500], ["15.000 seguidores", 15_000],
      ["2000", 2_000], ["Média de 300", 300], ["1,2 milhão", 1_200_000], ["não sei", null], ["", null],
    ];
    for (const [t, n] of cases) expect([t, parseFollowers(t)]).toEqual([t, n]);
  });

  it("acha repetida por e-mail, CPF ou @, nunca a própria", () => {
    const me = { id: "a", email: "Maria@X.com", cpf: "529.982.247-25", instagram: "https://instagram.com/Maria.Ex/" };
    const pool = [
      { id: "a", kind: "candidata" as const, name: "Eu mesma", email: "maria@x.com", cpf: null, instagram: null },
      { id: "b", kind: "candidata" as const, name: "Maria", status: "REJECTED", email: "maria@x.com", cpf: "52998224725", instagram: null },
      { id: "c", kind: "creator" as const, name: "Maria E.", email: "outra@x.com", cpf: null, instagram: "@maria.ex" },
      { id: "d", kind: "creator" as const, name: "Outra", email: "z@x.com", cpf: "", instagram: "@ma" },
    ];
    expect(findDuplicates(me, pool)).toEqual([
      { id: "b", kind: "candidata", name: "Maria", status: "REJECTED", by: ["e-mail", "CPF"] },
      { id: "c", kind: "creator", name: "Maria E.", by: ["@"] },
    ]);
  });

  it("busca, filtros e ordem", () => {
    const row = (id: string, o: Partial<Parameters<typeof filterApplications>[0][number]>) => ({
      id, fullName: id, email: null, instagram: null, categoryProposal: "INFLUENCER", source: "site_form", hunter: null, alsoVermeFree: false,
      submittedAt: new Date("2026-10-01"), followersCount: null, ...o,
    });
    const rows = [
      row("Ana", { submittedAt: new Date("2026-10-03"), followersCount: 500, instagram: "@ana.fit" }),
      row("Bia", { submittedAt: new Date("2026-10-01"), followersCount: 9000, categoryProposal: "UGC", hunter: { code: "joao" } }),
      row("Caca", { submittedAt: new Date("2026-10-02"), source: "captacao_form", alsoVermeFree: true }),
    ];
    expect(filterApplications(rows, {}).map((r) => r.id)).toEqual(["Bia", "Caca", "Ana"]);
    expect(filterApplications(rows, { sort: "seguidores" }).map((r) => r.id)).toEqual(["Bia", "Ana", "Caca"]);
    expect(filterApplications(rows, { sort: "novas" }).map((r) => r.id)).toEqual(["Ana", "Caca", "Bia"]);
    expect(filterApplications(rows, { q: "@ANA.fit" }).map((r) => r.id)).toEqual(["Ana"]);
    expect(filterApplications(rows, { kind: "UGC" }).map((r) => r.id)).toEqual(["Bia"]);
    expect(filterApplications(rows, { hunter: "joao" }).map((r) => r.id)).toEqual(["Bia"]);
    expect(filterApplications(rows, { hunter: "nenhum" }).map((r) => r.id)).toEqual(["Caca", "Ana"]);
    expect(filterApplications(rows, { source: "captacao_form", vermefree: true }).map((r) => r.id)).toEqual(["Caca"]);
  });
});
