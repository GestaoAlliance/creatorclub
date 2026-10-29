/**
 * Mensagens prontas de WhatsApp para as candidatas (F3): a equipe abre o WhatsApp da pessoa com o texto escrito,
 * revisa e envia. Nada é enviado sozinho.
 */

/** Link `wa.me` com o texto pronto. Número brasileiro sem DDI ganha 55. Sem número utilizável: null. */
export function whatsappLink(phone: string | null | undefined, text: string): string | null {
  let d = (phone ?? "").replace(/\D/g, "").replace(/^0+/, "");
  if (d.length === 10 || d.length === 11) d = `55${d}`;
  if (!/^55\d{10,11}$/.test(d)) return null;
  return `https://wa.me/${d}?text=${encodeURIComponent(text)}`;
}

const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? "";

/**
 * Mensagem de aprovação (D-D4SIGN, texto da Vanessa em 2026-10-26, o mesmo para todas as marcas): o contrato já foi
 * assinado no D4Sign antes do cadastro. Fala do produto de boas-vindas (aba Pedidos, com a sugestão da marca quando há),
 * do cupom e do acesso ao portal. Sem emoji de tecla numérica nem coração novo (🩷), que aparecem quebrados em alguns
 * celulares (pedido do responsável, 2026-10-27): com o e-mail e a senha do cadastro (`loginUrl`) ou criando a senha pelo convite.
 */
export function approvalMessage(p: {
  brand: string;
  coupon: string;
  discountBps: number;
  /** Produto sugerido da marca (Marcas); vazio = sem a linha da sugestão. */
  suggestion?: string | null;
  /** Aba Pedidos (passando pelo login). Só para quem já tem senha. */
  ordersUrl?: string | null;
  loginUrl?: string | null;
  inviteLink?: string | null;
  /** D-WELCOMEVIDEO: Opção 2 (2 produtos + 3 vídeos para a marca). */
  withVideos?: boolean;
}): string {
  const pct = (p.discountBps / 100).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  const suggestion = p.suggestion?.trim();
  const access = p.inviteLink
    ? `*3. Acesse seu portal:* Acompanhe suas vendas, saldo, extrato e solicite seus saques. Crie sua senha por este link (vale 7 dias e funciona uma vez):\n\n🔗 ${p.inviteLink}`
    : p.loginUrl
      ? `*3. Acesse seu portal:* Acompanhe suas vendas, saldo, extrato e solicite seus saques usando o e-mail e a senha cadastrados.\n\n🔗 ${p.loginUrl}`
      : "*3. Acesse seu portal:* Acompanhe suas vendas, saldo, extrato e solicite seus saques. Já já te mando o link de acesso.";
  return [
    "Prontinho, sua parceria foi aprovada! 💖✨",
    ...(p.withVideos
      ? [
          `Para começar, você tem direito a escolher 2 produtos da ${p.brand} para experimentar!`,
          "Como combinamos, em troca você grava 3 vídeos para a marca usar no tráfego e no Instagram (pode ser em collab com a gente).",
          "*1. Escolha seus produtos:* Acesse a aba Pedidos na plataforma e faça sua solicitação.",
        ]
      : [
          `Para começar, você tem direito a escolher 1 produto da ${p.brand} para experimentar!`,
          "*1. Escolha seu produto:* Acesse a aba Pedidos na plataforma e faça sua solicitação.",
        ]),
    ...(p.ordersUrl ? [`🔗 ${p.ordersUrl}`] : []),
    ...(suggestion ? [`💡 Nossa sugestão: ${suggestion} ✨`] : []),
    `*2. Seu cupom exclusivo:* ${p.coupon}`,
    `Seus seguidores ganham ${pct}% de desconto usando seu cupom, e cada venda fica registrada para você!`,
    access,
    "Qualquer dúvida, é só me chamar por aqui! 💖",
  ].join("\n\n");
}

/**
 * Convite do portal para quem já está no Creator Club e ainda não criou a senha (D-ACCESSREQ): mandado pela equipe
 * no WhatsApp, pela ficha ou em massa na lista de creators.
 */
export function portalInviteMessage(p: { name: string; brand: string; link: string; until: Date }): string {
  const until = p.until.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" });
  return [
    `Oi, ${firstName(p.name)}! Aqui é da ${p.brand}. 💜`,
    "Seu acesso ao portal do Creator Club está pronto: lá você acompanha suas vendas, seu cupom, seu saldo e pede o saque.",
    `Crie a sua senha por este link (vale até ${until} e funciona uma vez):\n${p.link}`,
  ].join("\n\n");
}

/**
 * Link de assinatura do contrato (D-AUTENTIQUE2, texto aprovado pelo responsável em 2026-10-29): sai sozinho pelo
 * WhatsApp da marca quando o contrato da candidata é gerado no Autentique.
 */
export function contractLinkMessage(p: { name: string; brand: string; link: string }): string {
  return [
    `Oi, ${firstName(p.name)}! Recebemos seu cadastro na ${p.brand} 💖 Seu contrato de parceria já está pronto para assinar (também mandamos no seu e-mail, pelo Autentique):`,
    `🔗 ${p.link}`,
    "Assim que você assinar, a gente analisa seu perfil e te retorna por aqui.",
  ].join("\n\n");
}

/** Recusa da candidata (D-AUTENTIQUE2, texto aprovado em 2026-10-29): a equipe abre o WhatsApp com o texto pronto. */
export function rejectionMessage(p: { name: string; brand: string }): string {
  return `Oi, ${firstName(p.name)}! Obrigada pelo interesse em ser parceira da ${p.brand} 💖 Neste momento não vamos seguir com a parceria, mas seu cadastro fica com a gente e podemos te chamar em uma próxima oportunidade. Um abraço!`;
}
