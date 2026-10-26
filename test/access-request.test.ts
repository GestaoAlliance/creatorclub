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

import { validateProductRequest } from "@/domain";

describe("pedido livre de produtos (D-PRODUCTREQ)", () => {
  it("de 1 a 3 no total, sem repetir", () => {
    expect(validateProductRequest([{ productId: "a", quantity: 2 }, { productId: "b", quantity: 0 }, { productId: "c", quantity: 1 }])).toEqual([{ productId: "a", quantity: 2 }, { productId: "c", quantity: 1 }]);
    expect(() => validateProductRequest([{ productId: "a", quantity: 4 }])).toThrow(/no máximo 3 suplementos/);
    expect(() => validateProductRequest([{ productId: "a", quantity: 4 }], "revita-derma")).toThrow(/no máximo 3 produtos/);
    expect(() => validateProductRequest([])).toThrow(/pelo menos 1/);
    expect(() => validateProductRequest([{ productId: "a", quantity: 1 }, { productId: "a", quantity: 1 }])).toThrow(/repetido/);
  });
});
