import { describe, expect, it } from "vitest";
import { campaignPhase, campaignStandings, inCampaignAudience, parseMoneyCents } from "@/domain";

const T = (s: string) => new Date(s);

describe("campanhas (M4.5, D-CAMPAIGN)", () => {
  it("ranking: mais vendas na frente; empate: quem chegou antes; sem venda não leva prêmio de posição; meta para todas", () => {
    const s = campaignStandings(
      [
        { creatorId: "a", name: "Ana", salesCents: 50_000, reachedAt: T("2026-10-20T12:00:00Z") },
        { creatorId: "b", name: "Bia", salesCents: 80_000, reachedAt: T("2026-10-21T12:00:00Z") },
        { creatorId: "c", name: "Cris", salesCents: 50_000, reachedAt: T("2026-10-19T12:00:00Z") },
        { creatorId: "d", name: "Duda", salesCents: 0, reachedAt: null },
      ],
      [30_000, 20_000, 10_000, 5_000],
      { cents: 50_000, prizeCents: 7_000 },
    );
    expect(s.map((x) => [x.creatorId, x.position, x.rankPrizeCents, x.goalPrizeCents])).toEqual([
      ["b", 1, 30_000, 7_000],
      ["c", 2, 20_000, 7_000],
      ["a", 3, 10_000, 7_000],
      ["d", 4, 0, 0],
    ]);
  });

  it("fases: rascunho, em breve, em andamento, aguardando 7 dias, confirmar, confirmada", () => {
    const c = { publishedAt: T("2026-10-01T00:00:00Z"), settledAt: null, startsAt: T("2026-10-10T03:00:00Z"), endsAt: T("2026-10-20T03:00:00Z") };
    expect(campaignPhase({ ...c, publishedAt: null }, T("2026-10-15T00:00:00Z"))).toBe("DRAFT");
    expect(campaignPhase(c, T("2026-10-05T00:00:00Z"))).toBe("SOON");
    expect(campaignPhase(c, T("2026-10-15T00:00:00Z"))).toBe("RUNNING");
    expect(campaignPhase(c, T("2026-10-26T00:00:00Z"))).toBe("WAITING");
    expect(campaignPhase(c, T("2026-10-27T03:00:00Z"))).toBe("SETTLE");
    expect(campaignPhase({ ...c, settledAt: T("2026-10-28T00:00:00Z") }, T("2026-10-29T00:00:00Z"))).toBe("SETTLED");
  });

  it("público: vazio = todas; tipo e tag precisam bater; valores em reais", () => {
    expect(inCampaignAudience({ categories: [], tagIds: [] }, { categories: ["UGC"], tagIds: [] })).toBe(true);
    expect(inCampaignAudience({ categories: ["PRESCRITOR"], tagIds: [] }, { categories: ["INFLUENCER"], tagIds: [] })).toBe(false);
    expect(inCampaignAudience({ categories: [], tagIds: ["t1"] }, { categories: ["INFLUENCER"], tagIds: ["t1", "t2"] })).toBe(true);
    expect([parseMoneyCents("500"), parseMoneyCents("1.200,50"), parseMoneyCents(" "), parseMoneyCents("R$ 30,5")]).toEqual([50_000, 120_050, null, 3_050]);
    expect(() => parseMoneyCents("12,345")).toThrow();
  });
});
