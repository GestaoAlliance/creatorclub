import { describe, expect, it } from "vitest";
import { partnershipTerms, SIGNUP_BRANDS, SIGNUP_QUESTIONS, SIGNUP_SECTIONS, SIGNUP_STEPS, validateSignup, wantedBrands, signupBrandFor, signupBrandSlug, signupConsentText, signupCouponPreview, signupCouponValid, withBrand } from "@/domain";
import { categoryFromAnswer, extraAnswers, parseHunterAnswers } from "@/lib/onboarding/applications";

const full: Record<string, string> = {
  fullName: "  Maria   Exemplo ", kind: "Influencer e UGC", phone: "(11) 91234-5678", email: "Maria@Example.com",
  instagram: "https://www.instagram.com/maria.exemplo/?hl=pt", followers: "12 mil", storiesViews: "800", niche: "Saúde",
  content: "Rotina\nfitness", why: "Uso os produtos", knows: "Sim", commissioned: "Não", accepts: "Sim",
  brands: "Botanika, VermeFree", collab: "Sim", address: "Rua A, 1\nSão Paulo - SP", coupon: "MARIA", cpf: "529.982.247-25", pix: "maria@example.com",
};

describe("formulário de inscrição do sistema (D-SIGNUP)", () => {
  it("resposta completa vira o mesmo formato do Google e é lida igual pela equipe", () => {
    const r = validateSignup(full, true);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.answers["@ do seu Instagram:"]).toBe("@maria.exemplo");
    expect(r.answers["ENDEREÇO PARA ENTREGA DOS SUPLEMENTOS (Endereço completo com: Rua/Av, bairro, número, cidade, Estado, CEP, ponto de referência)"]).toBe("Rua A, 1\nSão Paulo - SP");
    const f = parseHunterAnswers(r.answers);
    expect(f).toMatchObject({ fullName: "Maria Exemplo", email: "maria@example.com", instagram: "@maria.exemplo", followers: "12 mil", storiesViews: "800", brandsWanted: "Botanika, VermeFree", collabInterest: "Sim", suggestedCoupon: "MARIA", cnpj: null });
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
    // CNPJ e razão social são opcionais; a marca vem do endereço (D-SIGNUPBRAND); o resto é obrigatório, como no Google.
    expect(SIGNUP_QUESTIONS.filter((q) => !q.required).map((q) => q.key)).toEqual(["brands", "cnpj", "companyName"]);
  });

  it("marcas de interesse: caixas de seleção só com as opções; leitura também das respostas antigas do Google", () => {
    expect(SIGNUP_BRANDS).toEqual(["Botanika", "VermeFree", "Revita Derma"]);
    expect(validateSignup({ ...full, brands: "VermeFree" }, true).ok).toBe(true);
    const bad = validateSignup({ ...full, brands: "Botanika, Shoty" }, true);
    expect(bad.ok ? null : bad.errors.brands).toBe("Escolha entre as opções.");
    expect(wantedBrands("Botanika, Revita Derma")).toEqual(["Botanika", "Revita Derma"]);
    expect(wantedBrands("Botanika e VermeFree")).toEqual(["Botanika", "VermeFree"]);
    expect(SIGNUP_BRANDS.map(signupBrandSlug)).toEqual(["botanika", "vermefree", "revita-derma"]);
    expect(wantedBrands("Só a vermefree")).toEqual(["VermeFree"]);
    expect(wantedBrands("revita  derma")).toEqual(["Revita Derma"]);
    expect(wantedBrands(null)).toEqual([]);
  });
});

describe("blocos da página de inscrição (D-SIGNUPDESIGN)", () => {
  it("cada pergunta aparece em exatamente um bloco; a marca não é pergunta (vem do endereço, D-SIGNUPBRAND)", () => {
    const keys = SIGNUP_SECTIONS.flatMap((s) => s.keys);
    expect(new Set(keys).size).toBe(keys.length);
    expect([...keys].sort()).toEqual(SIGNUP_QUESTIONS.map((q) => q.key).filter((k) => k !== "brands").sort());
  });

  it("perguntas com o nome da marca do formulário", () => {
    const label = (key: string) => withBrand(SIGNUP_QUESTIONS.find((q) => q.key === key)!.label, "VermeFree");
    expect(label("knows")).toBe("Você já conhece a VermeFree?");
    expect(label("collab")).toContain("perfil do Instagram da VermeFree");
    expect(signupBrandFor("revita-derma")).toBe("Revita Derma");
    expect(signupBrandFor("shoty")).toBeNull();
    expect(signupConsentText("Botanika")).toBe(
      "Concordo com o uso dos meus dados pessoais pela Botanika para análise da minha inscrição e, caso seja aprovado(a), para elaboração do contrato de parceria e criação do meu acesso ao Creator Club, portal de influenciadores da Botanika.",
    );
  });

  it("prévia do cupom: só letras, maiúsculas, até 8", () => {
    expect(signupCouponPreview("maria 10")).toBe("MARIA");
    expect(signupCouponPreview("Júlia_Colares")).toBe("JULIACOL");
    expect(signupCouponPreview("")).toBe("");
  });
});

describe("etapas da inscrição (D-SIGNUPSTEPS)", () => {
  it("duas etapas e cada bloco em exatamente uma", () => {
    expect(SIGNUP_STEPS).toHaveLength(2);
    const ids = SIGNUP_STEPS.flatMap((s) => s.sections);
    expect([...ids].sort()).toEqual(SIGNUP_SECTIONS.map((s) => s.id).sort());
  });
});

describe("sugestão de cupom só com letras (D-SIGNUPCOUPON)", () => {
  it("aceita letras (com acento) de 2 a 8 e recusa números, espaços e símbolos", () => {
    expect(signupCouponValid("maria")).toBe(true);
    expect(signupCouponValid("Júlia")).toBe(true);
    expect(signupCouponValid("MARIA10")).toBe(false);
    expect(signupCouponValid("ana maria")).toBe(false);
    expect(signupCouponValid("ana-b")).toBe(false);
    expect(signupCouponValid("A")).toBe(false);
    expect(signupCouponValid("ABCDEFGHI")).toBe(false);
  });

  it("a inscrição recusa cupom com número e grava o válido em maiúsculas", () => {
    expect(validateSignup({ ...full, coupon: "maria10" }, true)).toMatchObject({ ok: false, errors: { coupon: expect.stringMatching(/só letras/) } });
    const ok = validateSignup({ ...full, coupon: "júlia" }, true);
    expect(ok.ok && Object.values(ok.answers)).toContain("JULIA");
  });
});

describe("Como funciona a parceria (inscrição)", () => {
  it("usa os números da marca e dos contratos; sem número, não cita", () => {
    const t = partnershipTerms({ discountBps: 500, commissionBps: 1500, minInfluencerCents: 50_000, minPrescritorCents: 100_000, months: 6, ugcMonths: 3 });
    expect(t.map((x) => `${x.title}: ${x.text}`)).toEqual([
      "Cupom com o seu nome: quem compra com ele ganha 5% de desconto.",
      "Comissão de 15%: sobre o valor dos produtos de cada venda com o seu cupom.",
      "Fechamento todo dia 1: a comissão do mês é liberada quando as suas vendas somam pelo menos R$ 500 (prescritor: R$ 1.000). Se não chegar, acumula para o mês seguinte.",
      "Saque do dia 1 ao 10: com nota fiscal do valor liberado; o pagamento sai até o dia 15.",
      "Produtos em casa: kit de boas-vindas ao começar e produtos todo mês conforme as suas vendas.",
      "Contrato de 6 meses (UGC: 3 meses): assinado online.",
    ]);
    const none = partnershipTerms({ discountBps: null, commissionBps: null, minInfluencerCents: null, minPrescritorCents: null, months: null, ugcMonths: null });
    expect(none[0]!.text).toBe("quem compra com ele ganha desconto.");
    expect(none[1]!.title).toBe("Comissão");
    expect(none[2]!.text).toContain("mínimo do contrato");
  });
});
