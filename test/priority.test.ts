import { describe, expect, it } from "vitest";
import { applicationPriority, filterApplications, nicheMatches, type PriorityInput } from "@/domain";

const base: PriorityInput = { hunter: null, instagram: null, tiktok: null, followersCount: null, storiesViews: null, complete: false, niche: null, categoryProposal: "INFLUENCER", collabInterest: null, duplicate: false };

describe("prioridade das candidatas (M2.3, D-PRIORITY)", () => {
  it("soma os sinais e dá o selo", () => {
    expect(applicationPriority(base, "botanika")).toEqual({ level: "BAIXA", score: 0, reasons: [] });
    const top = applicationPriority(
      { ...base, hunter: { code: "x" }, instagram: "@ana", followersCount: 60_000, storiesViews: "2 mil", complete: true, niche: "Saúde e bem-estar", collabInterest: "Sim" },
      "botanika",
    );
    expect(top).toMatchObject({ level: "ALTA", score: 10 });
    expect(top.reasons).toEqual(["veio de hunter", "50 mil+ seguidores", "1 mil+ views nos stories", "tem @", "cadastro completo", "nicho combina com a marca", "topa collab"]);
    expect(applicationPriority({ ...base, categoryProposal: "PRESCRITOR", instagram: "@nutri" }, "botanika")).toMatchObject({ level: "MEDIA", score: 3 });
    expect(applicationPriority({ ...base, collabInterest: "Não" }, "botanika").score).toBe(0);
  });

  it("nicho por marca: Revita é beleza; Botanika e VermeFree, saúde", () => {
    expect(nicheMatches("Skincare e beleza", "revita-derma")).toBe(true);
    expect(nicheMatches("Saúde e bem-estar", "revita-derma")).toBe(false);
    expect(nicheMatches("Fitness", "vermefree")).toBe(true);
    expect(nicheMatches("Pets", "botanika")).toBe(false);
  });

  it("repetida vai para o fim mesmo com muitos pontos; empate: quem espera há mais tempo", () => {
    const row = (id: string, p: Partial<PriorityInput>, day: number) => ({
      id, fullName: id, email: null, instagram: null, categoryProposal: "INFLUENCER", source: "site_form", hunter: null, brands: [], followersCount: null,
      submittedAt: new Date(`2026-10-${String(day).padStart(2, "0")}T12:00:00Z`),
      priority: applicationPriority({ ...base, ...p }, "botanika"),
    });
    const rows = [row("dup", { hunter: {}, duplicate: true }, 1), row("baixa", {}, 2), row("alta", { hunter: {}, followersCount: 200_000 }, 5), row("media-velha", { hunter: {} }, 3), row("media-nova", { hunter: {} }, 4)];
    expect(filterApplications(rows, {}).map((r) => r.id)).toEqual(["alta", "media-velha", "media-nova", "baixa", "dup"]);
    expect(filterApplications(rows, { sort: "antigas" }).map((r) => r.id)).toEqual(["dup", "baixa", "media-velha", "media-nova", "alta"]);
  });
});
