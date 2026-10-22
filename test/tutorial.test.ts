import { describe, expect, it } from "vitest";
import { HELP, helpText, placeBalloon, TOURS, tourScreenFor, tourSeenKey, tourSteps } from "@/domain/tutorial";

describe("tutoriais do portal e da equipe (D-TUTORIAL)", () => {
  it("todo texto é curto (cabe no balão) e todo passo de tela tem texto", () => {
    for (const ids of Object.values(TOURS)) for (const id of ids) expect(HELP[id]).toBeDefined();
    for (const id of Object.keys(HELP) as (keyof typeof HELP)[]) {
      expect(HELP[id].title.length).toBeGreaterThan(0);
      expect(helpText(id).length).toBeLessThanOrEqual(170);
      expect(helpText(id, true).length).toBeLessThanOrEqual(170);
    }
  });

  it("UGC não lê sobre comissão (D-UGCPORTAL)", () => {
    for (const id of ["vendas-resumo", "vendas-lista", "cupom-codigo"] as const)
      expect(helpText(id, true)).not.toMatch(/comiss/i);
    expect(helpText("cupom-codigo")).toMatch(/comissão/);
  });

  it("acha a tela pela URL do portal", () => {
    expect(tourScreenFor("/portal/botanika")).toBe("inicio");
    expect(tourScreenFor("/portal/botanika/vendas")).toBe("vendas");
    expect(tourScreenFor("/portal/botanika/saque")).toBe("saque");
    expect(tourScreenFor("/portal/botanika/envios")).toBe("envios");
    expect(tourScreenFor("/portal/botanika/cupom")).toBeNull(); // Cupom entrou no Início (M0.0.5)
    expect(tourScreenFor("/portal/botanika/saque/novo")).toBeNull();
    expect(tourScreenFor("/portal/botanika/avisos")).toBeNull();
    expect(tourScreenFor("/portal/botanika/inicio")).toBeNull();
    expect(tourScreenFor("/admin")).toBeNull();
  });

  it("acha a tela da equipe pela URL", () => {
    expect(tourScreenFor("/admin/marca")).toBe("equipe-inicio");
    expect(tourScreenFor("/admin/candidatas")).toBe("equipe-candidatas");
    expect(tourScreenFor("/admin/creators")).toBe("equipe-creators");
    expect(tourScreenFor("/admin/creators/0b6c2a40-1111-4b8e-9d4e-2c1f00000000")).toBe("equipe-ficha");
    expect(tourScreenFor("/admin/cupons")).toBe("equipe-cupons");
    expect(tourScreenFor("/admin/envios")).toBe("equipe-envios");
    expect(tourScreenFor("/admin/saques")).toBe("equipe-saques");
    expect(tourScreenFor("/admin/desempenho")).toBe("equipe-desempenho");
    // Telas de configuração ficam sem tutorial nesta leva.
    expect(tourScreenFor("/admin/sync")).toBeNull();
    expect(tourScreenFor("/admin/saques/nf/abc")).toBeNull();
  });

  it("passo de botão que o papel não tem some (o botão não está na tela)", () => {
    // Álvaro (Envio): sem "Aprovar pedido"; Ana (Gestão) sem "Marcar enviado".
    const alvaro = new Set(["en-situacao", "en-cartao", "en-enviado"]);
    expect(tourSteps("equipe-envios", (id) => alvaro.has(id))).toEqual(["en-situacao", "en-cartao", "en-enviado"]);
  });

  it("pula o passo cujo cartão não está na tela, mantendo a ordem", () => {
    expect(tourSteps("vendas", (id) => id !== "vendas-grafico")).toEqual(["periodo", "vendas-resumo", "vendas-lista"]);
    expect(tourSteps("envios", () => false)).toEqual([]);
  });

  it("guarda o já visto por tela", () => {
    expect(tourSeenKey("saque")).toBe("cc-tour:v1:saque");
  });

  it("balão abaixo do alvo quando cabe, acima quando não, sem sair da tela", () => {
    const vp = { width: 390, height: 800 };
    const size = { width: 320, height: 150 };
    expect(placeBalloon({ top: 100, bottom: 200, left: 200, right: 380 }, size, vp)).toEqual({ top: 212, left: 54, side: "below" });
    expect(placeBalloon({ top: 600, bottom: 700, left: 10, right: 100 }, size, vp)).toEqual({ top: 438, left: 16, side: "above" });
    // Menu de baixo (celular) conta como fim da tela.
    expect(placeBalloon({ top: 450, bottom: 560, left: 16, right: 370 }, size, vp, 12, 96).side).toBe("above");
    // Alvo do tamanho da tela: o balão fica no rodapé visível.
    expect(placeBalloon({ top: 5, bottom: 795, left: 16, right: 370 }, size, vp, 12, 96)).toEqual({ top: 538, left: 16, side: "below" });
  });
});
