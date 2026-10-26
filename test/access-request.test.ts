import { describe, expect, it } from "vitest";
import { ACTION_LABEL, ACTION_OWNER, actionDetail, actionMessage, portalInviteMessage } from "@/domain";

describe("pedido de acesso de quem já tem cadastro (D-ACCESSREQ)", () => {
  it("tarefa da Gestão em Ações, sem mensagem pronta (o link sai da ficha)", () => {
    expect(ACTION_LABEL.ACCESS).toBe("Pediu acesso");
    expect(ACTION_OWNER.ACCESS).toBe("GESTAO");
    expect(actionDetail({ kind: "ACCESS", day: "2026-10-26" })).toMatch(/pediu o link de acesso ao portal em 26\/10\/2026/);
    expect(actionMessage({ kind: "ACCESS", day: "2026-10-26" }, "Talita Rocha", "Revita Derma")).toBeNull();
  });

  it("mensagem do convite: primeiro nome, marca, link e validade", () => {
    const t = portalInviteMessage({ name: "Talita Rocha Goulart", brand: "Revita Derma", link: "https://cc/convite/abc", until: new Date("2026-11-02T15:00:00Z") });
    expect(t).toContain("Oi, Talita! Aqui é da Revita Derma.");
    expect(t).toContain("https://cc/convite/abc");
    expect(t).toContain("02/11");
  });
});
