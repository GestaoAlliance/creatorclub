import { describe, expect, it } from "vitest";
import { ACTION_OWNER, actionDetail, actionMessage, whatsappWithText } from "@/domain";

describe("fila de ações (M2.1, D-ACTIONS)", () => {
  it("motivo curto e mensagem pronta com o primeiro nome e a marca", () => {
    expect(actionDetail({ kind: "NEAR_MIN", missingCents: 12_000 })).toMatch(/faltam R\$\s120,00 para o mínimo do mês/);
    expect(actionDetail({ kind: "CONTRACT", endDay: "2026-11-05", expired: false })).toBe("contrato vence em 05/11/2026");
    expect(actionDetail({ kind: "CONTRACT", endDay: "2026-10-05", expired: true })).toBe("contrato venceu em 05/10/2026");
    const msg = actionMessage({ kind: "IDLE", days: 64 }, "Maria Clara Souza", "Revita Derma")!;
    expect(msg).toMatch(/^Oi, Maria! Aqui é da Revita Derma\./);
    expect(msg).toContain("64 dias");
    expect(msg).not.toMatch(/suplement/i); // Revita vende produtos (dermocosméticos)
    expect(actionMessage({ kind: "KIT_PENDING", days: 9 }, "Ana", "Revita Derma")).not.toMatch(/suplement/i);
    expect(actionMessage({ kind: "SHIP_STUCK", days: 4 }, "Ana", "Botanika")).toBeNull();
  });

  it("quem cuida: Gestão; envio parado é de quem envia", () => {
    expect(ACTION_OWNER).toEqual({ IDLE: "GESTAO", CONTRACT: "GESTAO", NEAR_MIN: "GESTAO", KIT_PENDING: "GESTAO", SHIP_STUCK: "ENVIO", BIRTHDAY: "GESTAO", NO_POST: "GESTAO", ACCESS: "GESTAO", UNSIGNED: "GESTAO" });
    // D-CONTRACTREMIND: a mensagem leva o link de assinatura.
    expect(actionMessage({ kind: "UNSIGNED", days: 8, link: "https://assina.ae/x" }, "Maria Clara", "Botanika")).toContain("https://assina.ae/x");
  });

  it("link do WhatsApp com o texto codificado", () => {
    expect(whatsappWithText("https://wa.me/5531999999999", "Oi, Ana! R$ 10 & mais")).toBe("https://wa.me/5531999999999?text=Oi%2C%20Ana!%20R%24%2010%20%26%20mais");
  });
});

describe("fila por urgência (D-ACTIONSBOARD)", () => {
  it("contrato vencido e sem assinar primeiro; aniversário de hoje sobe; sem post por último", async () => {
    const { actionRank } = await import("@/domain");
    const order = [
      { kind: "NO_POST", days: 20, never: false },
      { kind: "IDLE", days: 70 },
      { kind: "CONTRACT", endDay: "2026-12-01", expired: false },
      { kind: "UNSIGNED", days: 8, link: null },
      { kind: "CONTRACT", endDay: "2026-11-01", expired: true },
      { kind: "BIRTHDAY", day: "2026-11-11", days: 0 },
      { kind: "NEAR_MIN", missingCents: 1000 },
    ] as const;
    const ranked = [...order].sort((a, b) => actionRank(a).rank - actionRank(b).rank).map((f) => f.kind + ("expired" in f ? `:${f.expired}` : ""));
    expect(ranked).toEqual(["CONTRACT:true", "UNSIGNED", "BIRTHDAY", "NEAR_MIN", "CONTRACT:false", "IDLE", "NO_POST"]);
    expect(actionRank({ kind: "IDLE", days: 60, contractEnds: true }).tone).toBe("urgent");
  });
});
