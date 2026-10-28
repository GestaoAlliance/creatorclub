import { birthdayLabel, parseBirthDate } from "./birthday";
import { cleanProfile, profileAnswers, type ProfileFields } from "./profile";
import { dayKey } from "./time";
import { validBrPhone } from "./phone";

/**
 * Formulário de inscrição do próprio sistema (D-SIGNUP): um formulário por marca (D-SIGNUPBRAND), com as mesmas perguntas
 * dos formulários do Google (Hunter e Captação). Onde o texto diz `{marca}`, entra o nome da marca do formulário. Os títulos são os mesmos, então a resposta é gravada e lida igual (`parseHunterAnswers`).
 * Todas obrigatórias como no Google, menos CNPJ e razão social (quem não tem CNPJ recebe como pessoa física, D-PFRECEIPT).
 */

/** Marcas que a pessoa pode escolher representar (D-SIGNUP). Para incluir outra (ex.: Shoty), é só acrescentar aqui. */
export const SIGNUP_BRANDS = ["Botanika", "VermeFree", "Revita Derma"] as const;

/** Marca da inscrição pelo endereço (`/inscricao/revita-derma` → "Revita Derma"); fora da lista, null. */
export function signupBrandFor(slug: string): (typeof SIGNUP_BRANDS)[number] | null {
  return SIGNUP_BRANDS.find((b) => signupBrandSlug(b) === slug.toLowerCase()) ?? null;
}

/** Troca `{marca}` pelo nome da marca do formulário. */
export const withBrand = (text: string, brand: string) => text.replaceAll("{marca}", brand);

export type SignupQuestion = {
  key: string;
  /** Título igual ao do Google Forms (é por ele que a resposta é lida e mostrada à equipe). */
  title: string;
  label: string;
  kind: "text" | "email" | "tel" | "long" | "choice" | "multi";
  options?: readonly string[];
  required: boolean;
  hint?: string;
};

/**
 * Cadastro de creator (D-SIGNUPACCOUNT, pedido do responsável em 2026-10-22, no modelo da referência): uma página, poucos
 * campos, e a conta (com senha) nasce no envio. Os títulos seguem os do Google para a equipe ler a resposta igual
 * (`parseHunterAnswers`); o tipo entra como Influencer e a Ana muda na aprovação; o Pix é pedido no primeiro saque.
 */
export const SIGNUP_QUESTIONS: readonly SignupQuestion[] = [
  { key: "fullName", title: "Seu nome completo:", label: "Nome completo", kind: "text", required: true },
  { key: "cpf", title: "CPF: ", label: "CPF", kind: "text", required: true },
  { key: "cnpj", title: "CNPJ: ", label: "CNPJ", kind: "text", required: false, hint: "Se você emite nota como empresa ou MEI, informe aqui." },
  // M4.2 (D-TAGS): aniversário (opcional), para a equipe comemorar.
  { key: "birthDate", title: "Data de nascimento:", label: "Data de nascimento", kind: "text", required: false },
  { key: "email", title: "EMAIL:", label: "E-mail", kind: "email", required: true, hint: "É com ele que você entra no portal." },
  { key: "phone", title: "Seu whatsapp com DDD:", label: "Telefone (WhatsApp)", kind: "tel", required: true },
  { key: "instagram", title: "@ do seu Instagram:", label: "Instagram", kind: "text", required: true },
  { key: "tiktok", title: "@ do seu TikTok:", label: "TikTok", kind: "text", required: false },
  // Pedido da Vanessa (2026-10-27): logo abaixo do TikTok; "Sim" ou "Não".
  { key: "tiktokShop", title: "Tem TikTok Shop ativo?", label: "Tem TikTok Shop ativo?", kind: "text", required: false },
  { key: "coupon", title: "SUGESTÃO DE NOME DE CUPOM:", label: "Seu cupom", kind: "text", required: true, hint: "Use o seu nome ou apelido (ex.: MARIA ou JUJUFIT), sem números de desconto. De 3 a 20 letras." },
  { key: "address", title: "ENDEREÇO PARA ENTREGA DOS PRODUTOS (Endereço completo com: Rua/Av, bairro, número, cidade, Estado, CEP, ponto de referência)", label: "Endereço de entrega", kind: "long", required: true },
];

/** Blocos do cadastro, na ordem da página (a senha vem no fim, fora das respostas). */
export const SIGNUP_SECTIONS: readonly { id: string; title: string; hint?: string; keys: readonly string[] }[] = [
  { id: "dados", title: "Seus dados", keys: ["fullName", "cpf", "cnpj", "birthDate"] },
  { id: "contato", title: "Contato", keys: ["email", "phone"] },
  { id: "redes", title: "Redes sociais", hint: "Os perfis onde você vai divulgar.", keys: ["instagram", "tiktok", "tiktokShop"] },
  { id: "cupom", title: "Seu cupom", hint: "O código que seus seguidores usam na compra. É por ele que contamos as suas vendas.", keys: ["coupon"] },
  { id: "endereco", title: "Endereço de entrega", hint: "Para onde enviamos os seus produtos.", keys: ["address"] },
];

/** Cupom escolhido no cadastro (D-SIGNUPACCOUNT, substitui D-SIGNUPCOUPON): letras e números, de 3 a 20; acento cai. */
export const SIGNUP_COUPON_MIN = 3;
export const SIGNUP_COUPON_MAX = 20;

export function signupCouponValid(raw: string): boolean {
  const plain = raw.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
  return new RegExp(`^[A-Z0-9]{${SIGNUP_COUPON_MIN},${SIGNUP_COUPON_MAX}}$`).test(plain);
}

/** Cupom como ele aparece enquanto se digita: só letras e números, maiúsculas, até 20. */
export function signupCouponPreview(raw: string): string {
  return raw.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, SIGNUP_COUPON_MAX);
}

/** @ de rede social sem o @, sem o endereço do site e sem espaços ("https://instagram.com/maria/" → "maria"). */
export function socialHandle(raw: string | null | undefined): string {
  return (raw ?? "").trim().replace(/^.*(instagram\.com|tiktok\.com)\/@?/i, "").replace(/[/?#].*$/, "").replace(/^@+/, "").replace(/\s+/g, "").slice(0, 60);
}

/** Aceite de uso dos dados, gravado com a resposta. */
export const signupConsentText = (brand: string) =>
  `Concordo com o uso dos meus dados pessoais pela ${brand} para análise da minha inscrição e, caso seja aprovado(a), para elaboração do contrato de parceria e criação do meu acesso ao Creator Club, portal de influenciadores da ${brand}.`;

/** Números da marca para "Como funciona a parceria" (padrões da marca e dos contratos; sem número, o texto não cita). */
export type PartnershipNumbers = {
  discountBps: number | null;
  commissionBps: number | null;
  minInfluencerCents: number | null;
  minPrescritorCents: number | null;
  months: number | null;
  ugcMonths: number | null;
  /** D-MIN100: o mínimo conta a comissão (Botanika) em vez das vendas. */
  commissionBasis?: boolean;
};

const pctText = (bps: number) => `${(bps / 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
const brl = (cents: number) => `R$ ${(cents / 100).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;

/** "Como funciona a parceria" no topo da inscrição (texto aprovado pelo responsável e pela Ana em 2026-10-16). */
export function partnershipTerms(n: PartnershipNumbers): { title: string; text: string }[] {
  const min =
    n.minInfluencerCents != null
      ? `quando ${n.commissionBasis ? "a sua comissão soma" : "as suas vendas somam"} pelo menos ${brl(n.minInfluencerCents)}${n.minPrescritorCents != null && n.minPrescritorCents !== n.minInfluencerCents ? ` (prescritor: ${brl(n.minPrescritorCents)})` : ""}`
      : "quando as suas vendas chegam ao mínimo do contrato";
  const months = n.months != null ? `Contrato de ${n.months} meses${n.ugcMonths != null && n.ugcMonths !== n.months ? ` (UGC: ${n.ugcMonths} meses)` : ""}` : "Contrato";
  return [
    { title: "Cupom com o seu nome", text: n.discountBps != null ? `quem compra com ele ganha ${pctText(n.discountBps)} de desconto.` : "quem compra com ele ganha desconto." },
    { title: n.commissionBps != null ? `Comissão de ${pctText(n.commissionBps)}` : "Comissão", text: "sobre o valor dos produtos de cada venda com o seu cupom." },
    { title: "Fechamento todo dia 1", text: `a comissão do mês é liberada ${min}. Se não chegar, acumula para o mês seguinte.` },
    { title: "Saque do dia 1 ao 10", text: "com nota fiscal do valor liberado; o pagamento sai até o dia 15." },
    { title: "Produtos em casa", text: "kit de boas-vindas ao começar e produtos todo mês conforme as suas vendas." },
    { title: months, text: "assinado online." },
  ];
}

export type SignupResult = { ok: true; answers: Record<string, string>; account: SignupAccount } | { ok: false; errors: Record<string, string> };

const cpfValid = (input: string) => {
  const d = input.replace(/\D/g, "");
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const digit = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(d[i]) * (len + 1 - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return digit(9) === Number(d[9]) && digit(10) === Number(d[10]);
};

/**
 * Endereço da inscrição em campos (D-SIGNUPADDR): CEP primeiro (o formulário completa rua, bairro, cidade e UF pelo CEP),
 * depois número e complemento. Gravado como o texto de sempre na resposta "ENDEREÇO PARA ENTREGA…", com o CEP no fim.
 */
export const SIGNUP_ADDRESS_PARTS = ["addrZip", "addrStreet", "addrNumber", "addrComplement", "addrDistrict", "addrCity", "addrState"] as const;
export type SignupAddressPart = (typeof SIGNUP_ADDRESS_PARTS)[number];
export const SIGNUP_ADDRESS_OPTIONAL: readonly SignupAddressPart[] = ["addrComplement"];

/** Monta o texto do endereço a partir dos campos, ou os erros por campo. */
export function signupAddress(p: Partial<Record<SignupAddressPart, string | undefined>>): { text: string; errors: Record<string, string> } {
  const v = Object.fromEntries(SIGNUP_ADDRESS_PARTS.map((k) => [k, (p[k] ?? "").replace(/\s+/g, " ").trim().slice(0, 160)])) as Record<SignupAddressPart, string>;
  const errors: Record<string, string> = {};
  for (const k of SIGNUP_ADDRESS_PARTS) if (!v[k] && !SIGNUP_ADDRESS_OPTIONAL.includes(k)) errors[k] = "Preencha este campo.";
  const zip = v.addrZip.replace(/\D/g, "");
  if (v.addrZip && zip.length !== 8) errors.addrZip = "CEP precisa ter 8 números.";
  const uf = v.addrState.toUpperCase();
  if (v.addrState && !/^[A-Z]{2}$/.test(uf)) errors.addrState = "Escolha o estado (UF).";
  if (Object.keys(errors).length) return { text: "", errors };
  const text = `${v.addrStreet}, ${v.addrNumber}${v.addrComplement ? ` — ${v.addrComplement}` : ""}, ${v.addrDistrict}, ${v.addrCity}/${uf}, CEP ${zip.slice(0, 5)}-${zip.slice(5)}`;
  return { text, errors };
}

/** Dados do cadastro já limpos, para criar a conta (D-SIGNUPACCOUNT). */
export type SignupAccount = {
  name: string;
  email: string;
  phone: string;
  cpf: string;
  cnpj: string | null;
  instagram: string;
  tiktok: string | null;
  /** Tem TikTok Shop ativo (null = não respondeu). */
  tiktokShop: boolean | null;
  /** "AAAA-MM-DD" ou null (M4.2). */
  birthDate: string | null;
  /** M4.3 (D-PROFILEFIELDS): perfil opcional. */
  profile: ProfileFields;
  coupon: string;
  address: { zip: string; street: string; number: string; complement: string | null; district: string; city: string; state: string };
};

/**
 * Confere o cadastro e devolve as respostas no formato do Google ({ título: resposta }, para a equipe ler igual) e os
 * dados da conta, ou os erros por campo. A senha é conferida à parte (regra de login).
 */
export function validateSignup(values: Record<string, string | undefined>, today = dayKey(new Date(), "America/Sao_Paulo")): SignupResult {
  const errors: Record<string, string> = {};
  const answers: Record<string, string> = {};
  const addr = signupAddress(values);
  Object.assign(errors, addr.errors);
  values = { ...values, address: addr.text };
  const clean: Record<string, string> = {};
  for (const q of SIGNUP_QUESTIONS) {
    if (q.key === "address" && Object.keys(addr.errors).length) continue;
    const raw = values[q.key] ?? "";
    const v = raw.replace(/\s+/g, " ").trim().slice(0, 300);
    if (!v) {
      if (q.required) errors[q.key] = "Preencha este campo.";
      continue;
    }
    if (q.kind === "email" && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) errors[q.key] = "E-mail inválido.";
    else if (q.kind === "tel" && !validBrPhone(v)) errors[q.key] = "Informe só o DDD e o número, sem o +55 (ex.: (31) 99211-3232).";
    else if (q.key === "cpf" && !cpfValid(v)) errors[q.key] = "CPF inválido.";
    else if (q.key === "cnpj" && v.replace(/\D/g, "").length !== 14) errors[q.key] = "CNPJ precisa ter 14 números.";
    else if (q.key === "coupon" && !signupCouponValid(v)) errors[q.key] = "Use o seu nome ou apelido, de 3 a 20 letras e números (ex.: MARIA).";
    else if ((q.key === "instagram" || q.key === "tiktok") && !socialHandle(v)) errors[q.key] = "Informe o seu @.";
    else if (q.key === "tiktokShop" && v !== "Sim" && v !== "Não") errors[q.key] = "Responda Sim ou Não.";
    if (q.key === "birthDate") {
      const b = parseBirthDate(v, today);
      if (!b.ok || !b.day) errors[q.key] = "Data de nascimento inválida.";
      else {
        clean[q.key] = b.day;
        answers[q.title] = birthdayLabel(b.day, true);
      }
      continue;
    }
    const out = q.key === "coupon" ? signupCouponPreview(v) : q.key === "instagram" || q.key === "tiktok" ? socialHandle(v) : q.kind === "tel" ? validBrPhone(v)! : v;
    clean[q.key] = out;
    answers[q.title] = q.key === "instagram" || q.key === "tiktok" ? `@${out}` : out;
  }
  const profile = cleanProfile(values);
  if (!profile.ok) Object.assign(errors, profile.errors);
  if (Object.keys(errors).length || !profile.ok) return { ok: false, errors };
  Object.assign(answers, profileAnswers(profile.value));
  const zip = (values.addrZip ?? "").replace(/\D/g, "");
  const part = (k: SignupAddressPart) => (values[k] ?? "").replace(/\s+/g, " ").trim();
  return {
    ok: true,
    answers,
    account: {
      name: clean.fullName!,
      email: clean.email!.toLowerCase(),
      phone: clean.phone!,
      cpf: clean.cpf!.replace(/\D/g, ""),
      cnpj: clean.cnpj ? clean.cnpj.replace(/\D/g, "") : null,
      instagram: clean.instagram!,
      tiktok: clean.tiktok || null,
      tiktokShop: clean.tiktokShop ? clean.tiktokShop === "Sim" : null,
      birthDate: clean.birthDate || null,
      profile: profile.value,
      coupon: clean.coupon!,
      address: {
        zip,
        street: part("addrStreet").slice(0, 160),
        number: part("addrNumber").slice(0, 20),
        complement: part("addrComplement").slice(0, 80) || null,
        district: part("addrDistrict").slice(0, 80),
        city: part("addrCity").slice(0, 80),
        state: part("addrState").toUpperCase(),
      },
    },
  };
}

/** Endereço (slug) de uma marca da inscrição no sistema: "Revita Derma" → "revita-derma". */
export function signupBrandSlug(name: string): string {
  return name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-");
}

/** Marcas que a candidata quer representar, de qualquer formato de resposta ("Botanika e VermeFree", "Botanika, Revita Derma"). */
export function wantedBrands(answer: string | null | undefined): string[] {
  const a = (answer ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, "");
  return SIGNUP_BRANDS.filter((b) => a.includes(b.toLowerCase().replace(/\s+/g, "")));
}
