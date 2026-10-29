import { describe, expect, it } from "vitest";
import { originFromApplication, originKey, originText } from "@/domain";

const at = new Date("2026-10-12T15:00:00Z");
const app = (o: Partial<Parameters<typeof originFromApplication>[0]> = {}) => originFromApplication({ source: "site_form", hunter: null, submittedAt: at, prospected: false, ...o });

describe("origem da creator (D-ORIGIN)", () => {
  it("hunter manda; senão o formulário", () => {
    expect(app({ hunter: { id: "h1", name: "Fulana" } })).toMatchObject({ kind: "HUNTER", hunter: { name: "Fulana" }, day: "2026-10-12", manual: false });
    expect(app({ source: "hunter_form" }).kind).toBe("HUNTER");
    expect(app({ source: "captacao_form" }).kind).toBe("CAPTACAO");
    expect(app().kind).toBe("SITE");
    expect(app({ source: "staff_form" }).kind).toBe("EQUIPE");
    expect(app({ source: "staff_form", prospected: true }).kind).toBe("PROSPECCAO");
  });
  it("chave e texto", () => {
    const o = app({ hunter: { id: "h1", name: "Fulana" } });
    expect(originKey(o)).toBe("HUNTER:h1");
    expect(originText(o)).toBe("Hunter · Fulana");
    expect(originText(app())).toBe("Cadastro do site");
  });
});

describe("campanha e como conheceu (D-ORIGIN parte 2)", async () => {
  const { normalizeCampaignTag, heardFromValue } = await import("@/domain");
  it("etiqueta de campanha", () => {
    expect(normalizeCampaignTag("Stories Outubro!")).toBe("stories-outubro");
    expect(normalizeCampaignTag("Promoção_BF")).toBe("promocao_bf");
    expect(normalizeCampaignTag("   ")).toBeNull();
    expect(normalizeCampaignTag("x".repeat(60))).toHaveLength(40);
  });
  it("como conheceu", () => {
    expect(heardFromValue("TikTok", "")).toBe("TikTok");
    expect(heardFromValue("Outro", "  feira de saúde ")).toBe("Outro: feira de saúde");
    expect(heardFromValue("Outro", "")).toBe("Outro");
    expect(heardFromValue("qualquer", "x")).toBeNull();
  });
  it("campanha separa a origem no resumo e aparece no texto", () => {
    const o = app({ campaign: "stories-outubro" });
    expect(originKey(o)).toBe("SITE:c:stories-outubro");
    expect(originText(o)).toBe("Cadastro do site · campanha stories-outubro");
  });
});
