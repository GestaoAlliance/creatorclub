import { describe, expect, it } from "vitest";
import { briefingParts, campaignCountdown, campaignPhase, campaignPrizeText, campaignStandings, formatBRL, inCampaignAudience, notices, parseMoneyCents, placeMove } from "@/domain";

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

describe("portal de campanhas (D-PORTALCAMPAIGN)", () => {
  const T = (s: string) => new Date(s);
  const start = T("2026-11-10T03:00:00Z");
  const end = T("2026-11-15T03:00:00Z");
  it("contagem regressiva", () => {
    expect(campaignCountdown(T("2026-11-05T03:00:00Z"), start, end)).toBe("começa em 5 dias");
    expect(campaignCountdown(T("2026-11-09T00:00:00Z"), start, end)).toBe("começa amanhã");
    expect(campaignCountdown(T("2026-11-08T12:00:00Z"), start, end)).toBe("começa em 2 dias");
    expect(campaignCountdown(T("2026-11-09T20:00:00Z"), start, end)).toBe("começa em 7 h");
    expect(campaignCountdown(T("2026-11-10T03:30:00Z"), start, end)).toBe("termina em 4 dias e 23 h");
    expect(campaignCountdown(T("2026-11-10T02:30:00Z"), start, end)).toBe("começa em menos de 1 h");
    expect(campaignCountdown(T("2026-11-14T00:00:00Z"), start, end)).toBe("termina em 1 dia e 3 h");
    expect(campaignCountdown(T("2026-11-14T03:00:00Z"), start, end)).toBe("termina em 1 dia");
    expect(campaignCountdown(T("2026-11-15T01:00:00Z"), start, end)).toBe("termina em 2 h");
    expect(campaignCountdown(T("2026-11-15T02:30:00Z"), start, end)).toBe("termina em menos de 1 h");
    expect(campaignCountdown(T("2026-11-15T03:00:00Z"), start, end)).toBeNull();
  });
  it("briefing: links viram botões, sem repetir e sem pontuação final", () => {
    expect(briefingParts("Poste o reels.\nModelo: https://www.canva.com/x, e música https://drive.google.com/a.\nDe novo https://www.canva.com/x")).toEqual({
      text: "Poste o reels.\nModelo: canva.com, e música drive.google.com.\nDe novo canva.com",
      links: [{ url: "https://www.canva.com/x", label: "canva.com" }, { url: "https://drive.google.com/a", label: "drive.google.com" }],
    });
    expect(briefingParts("Sem link.")).toEqual({ text: "Sem link.", links: [] });
  });
  it("subiu/caiu e texto dos prêmios no aviso", () => {
    expect(placeMove(3, 1)).toBe(2);
    expect(placeMove(1, 2)).toBe(-1);
    expect(placeMove(null, 2)).toBeNull();
    expect(campaignPrizeText([50_000, 30_000], 300_000, 10_000, formatBRL)).toBe("Prêmios: 1º R$ 500,00, 2º R$ 300,00. Vendeu R$ 3.000,00? Ganha R$ 100,00.".replace(/R\$ /g, "R$ "));
    const n = notices.campaignNew("c1", "Esquenta", "2026-11-04", "2026-11-14", "Prêmios: 1º R$ 5.");
    expect(n).toMatchObject({ kind: "CAMPAIGN_NEW", dedupeKey: "campaign:c1", title: "Nova campanha: Esquenta", path: "/campanhas" });
    expect(n.body).toBe('De 04/11 a 14/11. Prêmios: 1º R$ 5. Veja o briefing e toque em "Quero participar".');
  });
});
