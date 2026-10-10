import { describe, expect, it } from "vitest";
import { categoryFromAnswer, couponFromSuggestion, extraAnswers, parseHunterAnswers } from "@/lib/onboarding/applications";

const answers = {
  "Seu nome completo:": "  Maria   da Silva ",
  "Sou:": "Prescritor (nutricionista, médico, profissional da área da saúde)",
  "Seu whatsapp com DDD:": "(11) 99999-0000",
  "EMAIL:": "Maria@Exemplo.COM ",
  "@ do seu Instagram:": "@maria",
  "Quantidade de seguidores no instagram": "12 mil",
  "Qual seu nicho ou sua área de atuação?": "Nutrição",
  "ENDEREÇO PARA ENTREGA DOS SUPLEMENTOS (Endereço completo com: Rua/Av, bairro, número, cidade, Estado, CEP, ponto de referência)": "Rua A, 1",
  "SUGESTÃO DE NOME DE CUPOM:": "Mari10",
  "CPF:": "529.982.247-25",
  "CNPJ:": "Não tenho",
  "RAZÃO SOCIAL:": "",
  "PIX PARA PAGAMENTO (pix da conta CNPJ)": "maria@exemplo.com",
};

describe("respostas do formulário Hunter", () => {
  it("lê cada pergunta pelo título, sem depender de acento ou maiúsculas", () => {
    expect(parseHunterAnswers(answers)).toMatchObject({
      fullName: "Maria da Silva",
      email: "maria@exemplo.com",
      phone: "(11) 99999-0000",
      instagram: "@maria",
      followers: "12 mil",
      niche: "Nutrição",
      address: "Rua A, 1",
      suggestedCoupon: "Mari10",
      cpf: "529.982.247-25",
      cnpj: "Não tenho",
      companyName: null,
      pixKey: "maria@exemplo.com",
    });
    expect(() => parseHunterAnswers({ "EMAIL:": "x@y.com" })).toThrow(/sem nome/);
  });

  it("tipo pelo 'Sou:' e cupom no formato aceito (só letras, até 8)", () => {
    expect(categoryFromAnswer(answers["Sou:"])).toBe("PRESCRITOR");
    expect(categoryFromAnswer("Influencer")).toBe("INFLUENCER");
    expect(categoryFromAnswer("UGC")).toBe("UGC");
    expect(couponFromSuggestion("Mari10")).toBe("MARI");
    expect(couponFromSuggestion("joão")).toBe("JOAO");
    expect(couponFromSuggestion("BELASAUDAVEL, BELA")).toBe("BELASAUD");
    expect(couponFromSuggestion(null)).toBe("");
  });
});

describe("formulário de Captação (D-CAPTACAO)", () => {
  // Títulos como estão no formulário de Captação Botanika + VermeFree (respostas fictícias).
  const answers = {
    "Seu nome completo:": "Maria Exemplo",
    "Sou:": "Influenciadora",
    "Tenho interesse em representar:": "Botanika e VermeFree",
    "Quantidade de seguidores no instagram": "12 mil",
    "Quantos visualizações tem seus stories? ": "800",
    "Qual seu nicho ou sua área de atuação?": "fitness",
    "O que você normalmente compartilha nos seus stories e feed? Fale um pouco do seu conteúdo": "treinos e receitas",
    "Você já trabalhou de forma comissionada para outras marcas?": "Sim",
    "Estamos selecionando alguns parceiros para fazermos Colabs com o perfil do instagram da Botanika e da VermeFree para divulgar": "Sim",
    "RAZÃO SOCIAL:": "MARIA EXEMPLO LTDA",
  };

  it("lê os campos novos e deixa as outras perguntas como respostas extras", () => {
    expect(parseHunterAnswers(answers)).toMatchObject({
      fullName: "Maria Exemplo",
      followers: "12 mil",
      storiesViews: "800",
      brandsWanted: "Botanika e VermeFree",
      collabInterest: "Sim",
      niche: "fitness",
      companyName: "MARIA EXEMPLO LTDA",
    });
    expect(extraAnswers(answers)).toEqual([
      { question: "O que você normalmente compartilha nos seus stories e feed? Fale um pouco do seu conteúdo", answer: "treinos e receitas" },
      { question: "Você já trabalhou de forma comissionada para outras marcas?", answer: "Sim" },
    ]);
  });
});
