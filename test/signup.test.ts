import { describe, expect, it } from "vitest";
import { SIGNUP_QUESTIONS, validateSignup } from "@/domain";
import { categoryFromAnswer, extraAnswers, parseHunterAnswers } from "@/lib/onboarding/applications";

const full: Record<string, string> = {
  fullName: "  Maria   Exemplo ", kind: "Influencer e UGC", phone: "(11) 91234-5678", email: "Maria@Example.com",
  instagram: "https://www.instagram.com/maria.exemplo/?hl=pt", followers: "12 mil", storiesViews: "800", niche: "Saúde",
  content: "Rotina\nfitness", why: "Uso os produtos", knows: "Sim", commissioned: "Não", accepts: "Sim",
  brands: "Botanika e VermeFree", collab: "Sim", address: "Rua A, 1\nSão Paulo - SP", coupon: "MARIA", cpf: "529.982.247-25", pix: "maria@example.com",
};

describe("formulário de inscrição do sistema (D-SIGNUP)", () => {
  it("resposta completa vira o mesmo formato do Google e é lida igual pela equipe", () => {
    const r = validateSignup(full, true);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.answers["@ do seu Instagram:"]).toBe("@maria.exemplo");
    expect(r.answers["ENDEREÇO PARA ENTREGA DOS SUPLEMENTOS (Endereço completo com: Rua/Av, bairro, número, cidade, Estado, CEP, ponto de referência)"]).toBe("Rua A, 1\nSão Paulo - SP");
    const f = parseHunterAnswers(r.answers);
    expect(f).toMatchObject({ fullName: "Maria Exemplo", email: "maria@example.com", instagram: "@maria.exemplo", followers: "12 mil", storiesViews: "800", brandsWanted: "Botanika e VermeFree", collabInterest: "Sim", suggestedCoupon: "MARIA", cnpj: null });
    expect(categoryFromAnswer(f.kindAnswer)).toBe("INFLUENCER");
    // As perguntas sem campo próprio aparecem para a equipe como antes.
    expect(extraAnswers(r.answers).map((x) => x.question)).toEqual(expect.arrayContaining([
      "O que você normalmente compartilha nos seus stories e feed? Fale um pouco do seu conteúdo",
      "Você já trabalhou de forma comissionada para outras marcas?",
    ]));
  });

  it("obrigatórias, opções, e-mail, WhatsApp, CPF, CNPJ e o aceite", () => {
    const r = validateSignup({ ...full, fullName: "", kind: "Outro", email: "x@", phone: "1234", cpf: "111.111.111-11", cnpj: "123" }, false);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors).toEqual({
      fullName: "Preencha este campo.", kind: "Escolha uma das opções.", email: "E-mail inválido.", phone: "Informe o WhatsApp com DDD.",
      cpf: "CPF inválido.", cnpj: "CNPJ precisa ter 14 números.", consent: "É preciso concordar para enviar.",
    });
    // CNPJ e razão social são opcionais; o resto é obrigatório, como no Google.
    expect(SIGNUP_QUESTIONS.filter((q) => !q.required).map((q) => q.key)).toEqual(["cnpj", "companyName"]);
  });
});
