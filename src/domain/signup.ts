/**
 * Formulário de inscrição do próprio sistema (D-SIGNUP): um formulário só, com as mesmas perguntas dos formulários do
 * Google (Hunter e Captação). Os títulos são os mesmos, então a resposta é gravada e lida igual (`parseHunterAnswers`).
 * Todas obrigatórias como no Google, menos CNPJ e razão social (quem não tem CNPJ recebe como pessoa física, D-PFRECEIPT).
 */

/** Marcas que a pessoa pode escolher representar (D-SIGNUP). Para incluir outra (ex.: Shoty), é só acrescentar aqui. */
export const SIGNUP_BRANDS = ["Botanika", "VermeFree", "Revita Derma"] as const;

/** A inscrição sem marca no endereço (`/inscricao`) entra nesta marca do sistema, a única ligada por enquanto. */
export const SIGNUP_DEFAULT_BRAND = "botanika";

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

const YES_NO = ["Sim", "Não"] as const;

export const SIGNUP_QUESTIONS: readonly SignupQuestion[] = [
  { key: "fullName", title: "Seu nome completo:", label: "Seu nome completo", kind: "text", required: true },
  {
    key: "kind", title: "Sou:", label: "Sou", kind: "choice", required: true,
    options: ["Influencer", "UGC", "Influencer e UGC", "Prescritor (nutricionista, médico, profissional da área da saúde)", "Todas opções acima"],
  },
  { key: "phone", title: "Seu whatsapp com DDD:", label: "Seu WhatsApp com DDD", kind: "tel", required: true, hint: "Ex.: (11) 91234-5678" },
  { key: "email", title: "EMAIL:", label: "E-mail", kind: "email", required: true },
  { key: "instagram", title: "@ do seu Instagram:", label: "@ do seu Instagram", kind: "text", required: true, hint: "Ex.: @seuperfil" },
  { key: "followers", title: "Quantidade de seguidores no instagram", label: "Quantidade de seguidores no Instagram", kind: "text", required: true },
  { key: "storiesViews", title: "Quantos visualizações tem seus stories? ", label: "Quantas visualizações têm seus stories?", kind: "text", required: true },
  { key: "niche", title: "Qual seu nicho ou sua área de atuação?", label: "Qual seu nicho ou sua área de atuação?", kind: "text", required: true },
  { key: "content", title: "O que você normalmente compartilha nos seus stories e feed? Fale um pouco do seu conteúdo", label: "O que você normalmente compartilha nos seus stories e feed? Fale um pouco do seu conteúdo", kind: "long", required: true },
  { key: "why", title: "Por que você acredita que faz sentido divulgar as marcas para a sua audiência?", label: "Por que você acredita que faz sentido divulgar as marcas para a sua audiência?", kind: "long", required: true },
  { key: "knows", title: "Você já conhece a Botanika Brasil e a VermeFree?  ", label: "Você já conhece a Botanika Brasil e a VermeFree?", kind: "choice", options: YES_NO, required: true },
  { key: "commissioned", title: "Você já trabalhou de forma comissionada para outras marcas?", label: "Você já trabalhou de forma comissionada para outras marcas?", kind: "choice", options: YES_NO, required: true },
  { key: "accepts", title: "Você aceita receber os produtos e compartilhar sua experiência com seu público, postando no feed e stories? ", label: "Você aceita receber os produtos e compartilhar sua experiência com seu público, postando no feed e stories?", kind: "choice", options: YES_NO, required: true },
  { key: "brands", title: "Tenho interesse em representar:", label: "Tenho interesse em representar", kind: "multi", options: SIGNUP_BRANDS, required: true, hint: "Pode marcar mais de uma." },
  { key: "collab", title: "Estamos selecionando alguns parceiros para fazermos Colabs com o perfil do instagram da Botanika e da VermeFree para divulgar o seu cupom, você tem interesse? ", label: "Estamos selecionando alguns parceiros para fazermos Colabs com o perfil do Instagram da Botanika e da VermeFree para divulgar o seu cupom. Você tem interesse?", kind: "choice", options: YES_NO, required: true },
  { key: "address", title: "ENDEREÇO PARA ENTREGA DOS SUPLEMENTOS (Endereço completo com: Rua/Av, bairro, número, cidade, Estado, CEP, ponto de referência)", label: "Endereço para entrega dos suplementos", kind: "long", required: true, hint: "Rua/Av., número, bairro, cidade, estado, CEP e ponto de referência" },
  { key: "coupon", title: "SUGESTÃO DE NOME DE CUPOM:", label: "Sugestão de nome de cupom", kind: "text", required: true, hint: "Só letras, até 8 (ex.: MARIA). É o código que seus seguidores vão usar." },
  { key: "cpf", title: "CPF: ", label: "CPF", kind: "text", required: true },
  { key: "cnpj", title: "CNPJ: ", label: "CNPJ (se tiver)", kind: "text", required: false },
  { key: "companyName", title: "RAZÃO SOCIAL:", label: "Razão social (se tiver CNPJ)", kind: "text", required: false },
  { key: "pix", title: "PIX PARA PAGAMENTO (pix da conta CNPJ)", label: "Chave Pix para pagamento", kind: "text", required: true },
];

/** Blocos da página de inscrição (D-SIGNUPDESIGN): uma página só, dividida em assuntos. Cada pergunta está em um bloco. */
export const SIGNUP_SECTIONS: readonly { id: string; title: string; hint: string; keys: readonly string[] }[] = [
  { id: "voce", title: "Quem é você", hint: "Conta pra gente quem está por trás do perfil.", keys: ["fullName", "kind", "phone", "email", "instagram"] },
  { id: "conteudo", title: "Suas redes", hint: "Seu público é o seu poder. Mostre como você conversa com ele.", keys: ["followers", "storiesViews", "niche", "content", "why"] },
  { id: "marcas", title: "Suas marcas", hint: "Escolha com quem quer crescer. Mais marcas, mais chances de vender.", keys: ["brands", "knows", "commissioned", "accepts", "collab"] },
  { id: "envio", title: "Receber e ganhar", hint: "Onde entregamos seus produtos e para onde vai a sua comissão.", keys: ["address", "coupon", "cpf", "cnpj", "companyName", "pix"] },
];

/** Etapas da inscrição (D-SIGNUPSTEPS): duas telas, cada uma com dois blocos. */
export const SIGNUP_STEPS: readonly { title: string; sections: readonly string[] }[] = [
  { title: "Você e suas redes", sections: ["voce", "conteudo"] },
  { title: "Marcas e comissão", sections: ["marcas", "envio"] },
];

/** Sugestão de cupom aceita (D-SIGNUPCOUPON): só letras (acento vale e cai), de 2 a 8. Número, espaço e símbolo, não. */
export function signupCouponValid(raw: string): boolean {
  const plain = raw.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
  return /^[A-Z]{2,8}$/.test(plain);
}

/** Cupom como ele aparece na prévia: só letras, maiúsculas, até 8 (a sugestão é conferida pela equipe na aprovação). */
export function signupCouponPreview(raw: string): string {
  return raw.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 8);
}

export const SIGNUP_CONSENT_TEXT =
  "Concordo que a Alliance e as marcas que escolhi acima usem estes dados para analisar minha inscrição e, se eu for aprovada, para o meu cadastro no Creator Club.";

export type SignupResult = { ok: true; answers: Record<string, string> } | { ok: false; errors: Record<string, string> };

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

/** Confere as respostas e devolve no formato do Google ({ título: resposta }) ou os erros por campo. */
export function validateSignup(values: Record<string, string | undefined>, consent: boolean): SignupResult {
  const errors: Record<string, string> = {};
  const answers: Record<string, string> = {};
  for (const q of SIGNUP_QUESTIONS) {
    const raw = values[q.key] ?? "";
    // Texto longo mantém as quebras de linha (endereço, conteúdo); os outros viram uma linha só.
    const v = (q.kind === "long" ? raw.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n") : raw.replace(/\s+/g, " ")).trim().slice(0, q.kind === "long" ? 1500 : 300);
    if (!v) {
      if (q.required) errors[q.key] = "Preencha este campo.";
      continue;
    }
    if (q.kind === "choice" && !q.options!.includes(v)) errors[q.key] = "Escolha uma das opções.";
    else if (q.kind === "multi" && v.split(", ").some((x) => !q.options!.includes(x))) errors[q.key] = "Escolha entre as opções.";
    else if (q.kind === "email" && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) errors[q.key] = "E-mail inválido.";
    else if (q.kind === "tel" && v.replace(/\D/g, "").length < 10) errors[q.key] = "Informe o WhatsApp com DDD.";
    else if (q.key === "cpf" && !cpfValid(v)) errors[q.key] = "CPF inválido.";
    else if (q.key === "cnpj" && v.replace(/\D/g, "").length !== 14) errors[q.key] = "CNPJ precisa ter 14 números.";
    else if (q.key === "coupon" && !signupCouponValid(v)) errors[q.key] = "Use só letras, de 2 a 8 (ex.: MARIA).";
    answers[q.title] = q.key === "coupon" ? signupCouponPreview(v) : q.key === "instagram" ? `@${v.replace(/^.*instagram\.com\//i, "").replace(/[/?#].*$/, "").replace(/^@+/, "")}` : v;
  }
  if (!consent) errors.consent = "É preciso concordar para enviar.";
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, answers };
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
