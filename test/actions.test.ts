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
    expect(ACTION_OWNER).toEqual({ IDLE: "GESTAO", CONTRACT: "GESTAO", NEAR_MIN: "GESTAO", KIT_PENDING: "GESTAO", SHIP_STUCK: "ENVIO", BIRTHDAY: "GESTAO", NO_POST: "GESTAO", ACCESS: "GESTAO" });
  });

  it("link do WhatsApp com o texto codificado", () => {
    expect(whatsappWithText("https://wa.me/5531999999999", "Oi, Ana! R$ 10 & mais")).toBe("https://wa.me/5531999999999?text=Oi%2C%20Ana!%20R%24%2010%20%26%20mais");
  });
});
