import { describe, expect, it } from "vitest";
import { partnershipTerms, signupAddress, SIGNUP_BRANDS, SIGNUP_QUESTIONS, SIGNUP_SECTIONS, socialHandle, validateSignup, wantedBrands, signupBrandFor, signupBrandSlug, signupConsentText, signupCouponPreview, signupCouponValid } from "@/domain";
import { categoryFromAnswer, extraAnswers, parseHunterAnswers } from "@/lib/onboarding/applications";

const full: Record<string, string> = {
  fullName: "  Maria   Exemplo ", cpf: "529.982.247-25", cnpj: "", email: "Maria@Example.com", phone: "(11) 91234-5678",
  instagram: "https://www.instagram.com/maria.exemplo/?hl=pt", tiktok: "@maria.tt", coupon: "maria10",
  addrZip: "01310-100", addrStreet: "Avenida Paulista", addrNumber: "1000", addrComplement: " apto 12 ", addrDistrict: "Bela Vista", addrCity: "São Paulo", addrState: "sp",
};
const ADDRESS = "ENDEREÇO PARA ENTREGA DOS PRODUTOS (Endereço completo com: Rua/Av, bairro, número, cidade, Estado, CEP, ponto de referência)";

describe("cadastro de creator (D-SIGNUPACCOUNT)", () => {
  it("telefone com +55 do país grava só DDD e número (D-PHONE)", () => {
    const r = validateSignup({ ...full, phone: "+55 31 92113-2390" });
    expect(r.ok && r.account.phone).toBe("(31) 92113-2390");
  });

  it("cadastro completo vira as respostas no formato do Google e os dados da conta", () => {
    const r = validateSignup(full);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.answers["@ do seu Instagram:"]).toBe("@maria.exemplo");
    expect(r.answers["@ do seu TikTok:"]).toBe("@maria.tt");
    expect(r.answers[ADDRESS]).toBe("Avenida Paulista, 1000 — apto 12, Bela Vista, São Paulo/SP, CEP 01310-100");
    expect(r.account).toEqual({
      name: "Maria Exemplo", email: "maria@example.com", phone: "(11) 91234-5678", cpf: "52998224725", cnpj: null, instagram: "maria.exemplo", tiktok: "maria.tt", tiktokShop: null, birthDate: null, coupon: "MARIA10",
      profile: { professionalId: null, niches: [], youtube: null, kwai: null, allergies: null, mediaKitUrl: null },
      address: { zip: "01310100", street: "Avenida Paulista", number: "1000", complement: "apto 12", district: "Bela Vista", city: "São Paulo", state: "SP" },
    });
    const f = parseHunterAnswers(r.answers);
    expect(f).toMatchObject({ fullName: "Maria Exemplo", email: "maria@example.com", instagram: "@maria.exemplo", tiktok: "@maria.tt", suggestedCoupon: "MARIA10", kindAnswer: null });
    // Sem a pergunta "Sou:", entra como Influencer; a Ana muda na aprovação.
    expect(categoryFromAnswer(f.kindAnswer)).toBe("INFLUENCER");
    expect(extraAnswers(r.answers)).toEqual([]);
  });

  it("obrigatórios, e-mail, telefone, CPF, CNPJ, @ e endereço com erro em cada campo", () => {
    const r = validateSignup({ ...full, fullName: "", email: "x@", phone: "1234", cpf: "111.111.111-11", cnpj: "123", instagram: "@", tiktok: "", addrZip: "0131", addrNumber: " " });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors).toEqual({
      fullName: "Preencha este campo.", email: "E-mail inválido.", phone: "Informe só o DDD e o número, sem o +55 (ex.: (31) 99211-3232).", cpf: "CPF inválido.", cnpj: "CNPJ precisa ter 14 números.",
      instagram: "Informe o seu @.", addrZip: "CEP precisa ter 8 números.", addrNumber: "Preencha este campo.",
    });
    // Opcionais: CNPJ, nascimento (M4.2), TikTok e complemento.
    expect(SIGNUP_QUESTIONS.filter((q) => !q.required).map((q) => q.key)).toEqual(["cnpj", "birthDate", "tiktok", "tiktokShop"]);
    // M4.2 (D-TAGS): nascimento do campo de data; vai para a conta e, em texto, para as respostas.
    const b = validateSignup({ ...full, birthDate: "1995-03-15" }, "2026-10-23");
    expect(b.ok && b.account.birthDate).toBe("1995-03-15");
    expect(b.ok && b.answers["Data de nascimento:"]).toBe("15/03/1995");
    expect(validateSignup({ ...full, birthDate: "2027-01-01" }, "2026-10-23")).toMatchObject({ ok: false, errors: { birthDate: "Data de nascimento inválida." } });
    expect(validateSignup({ ...full, tiktok: "", addrComplement: "" }).ok).toBe(true);
    expect(signupAddress({ ...full, addrComplement: "" }).text).toBe("Avenida Paulista, 1000, Bela Vista, São Paulo/SP, CEP 01310-100");
  });

  it("cupom: letras e números, de 3 a 20; acento cai; grava em maiúsculas", () => {
    expect(signupCouponValid("maria10")).toBe(true);
    expect(signupCouponValid("Júlia")).toBe(true);
    expect(signupCouponValid("ABC")).toBe(true);
    expect(signupCouponValid("AB")).toBe(false);
    expect(signupCouponValid("ABCDEFGHIJKLMNOPQRST")).toBe(true);
    expect(signupCouponValid("ABCDEFGHIJKLMNOPQRSTU")).toBe(false);
    expect(signupCouponValid("ana maria")).toBe(false);
    expect(signupCouponValid("ana-b")).toBe(false);
    expect(signupCouponPreview("maria 10!")).toBe("MARIA10");
    expect(signupCouponPreview("Júlia_Colares")).toBe("JULIACOLARES");
    expect(validateSignup({ ...full, coupon: "ab" })).toMatchObject({ ok: false, errors: { coupon: expect.stringMatching(/de 3 a 20/) } });
  });

  it("@ das redes sem o endereço do site e sem o @", () => {
    expect(socialHandle("https://www.tiktok.com/@maria.tt?lang=pt")).toBe("maria.tt");
    expect(socialHandle("@@maria")).toBe("maria");
    expect(socialHandle("  ")).toBe("");
  });

  it("cada campo aparece em exatamente um bloco; marcas e aceite", () => {
    const keys = SIGNUP_SECTIONS.flatMap((s) => s.keys);
    expect(new Set(keys).size).toBe(keys.length);
    expect([...keys].sort()).toEqual(SIGNUP_QUESTIONS.map((q) => q.key).sort());
    expect(SIGNUP_BRANDS.map(signupBrandSlug)).toEqual(["botanika", "vermefree", "revita-derma"]);
    expect(wantedBrands("Botanika e VermeFree")).toEqual(["Botanika", "VermeFree"]);
    expect(wantedBrands("revita  derma")).toEqual(["Revita Derma"]);
    expect(wantedBrands(null)).toEqual([]);
    expect(signupBrandFor("revita-derma")).toBe("Revita Derma");
    expect(signupBrandFor("shoty")).toBeNull();
    expect(signupConsentText("Botanika")).toBe(
      "Concordo com o uso dos meus dados pessoais pela Botanika para análise da minha inscrição e, caso seja aprovado(a), para elaboração do contrato de parceria e criação do meu acesso ao Creator Club, portal de influenciadores da Botanika.",
    );
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
