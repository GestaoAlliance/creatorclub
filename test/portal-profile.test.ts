import { describe, expect, it } from "vitest";
import { actionDetail, actionMessage, actionRank, profileCompleteness } from "@/domain";
import { maskCnpjDigits, maskCpfDigits } from "@/lib/portal/profile";

describe("Meu cadastro (D-PORTALPROFILE, D-DATAFIX)", () => {
  it("cadastro completo: percentual e o que falta", () => {
    const all = { pix: true, address: true, instagram: true, tiktok: true, birthDate: true, photo: true };
    expect(profileCompleteness(all)).toEqual({ pct: 100, missing: [] });
    expect(profileCompleteness({ ...all, tiktok: false, photo: false })).toEqual({ pct: 67, missing: ["TikTok", "foto"] });
  });

  it("CPF e CNPJ mascarados", () => {
    expect(maskCpfDigits("12345678901")).toBe("•••.456.789-••");
    expect(maskCnpjDigits("12345678000199")).toBe("••.345.678/0001-••");
    expect(maskCpfDigits("123")).toBe("•••");
  });

  it("pedido de correção na fila da Gestão", () => {
    const f = { kind: "FIX_DATA" as const, day: "2026-11-16", field: "CPF", message: "o certo é 123" };
    expect(actionDetail(f)).toBe('pediu em 16/11/2026 para corrigir o CPF: "o certo é 123". Corrija na ficha (Cadastro) e marque Feito');
    expect(actionMessage(f, "Ana Souza", "Botanika")).toMatch(/^Oi, Ana! Aqui é da Botanika\. Recebemos o seu pedido para corrigir o CPF\./);
    expect(actionRank(f)).toEqual({ rank: 35, tone: "warn" });
  });
});
