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

/** Boas-vindas depois de aprovar: cupom, desconto e, se houver, o link do convite do portal. */
export function welcomeMessage(p: { name: string; brand: string; coupon: string; discountBps: number; inviteLink: string | null; contract?: boolean; loginUrl?: string }): string {
  const pct = (p.discountBps / 100).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  return [
    `Oi, ${firstName(p.name)}! Sua inscrição no Creator Club da ${p.brand} foi aprovada!`,
    `Seu cupom é *${p.coupon}*: quem comprar com ele ganha ${pct}% de desconto, e a venda fica registrada para você.`,
    ...(p.inviteLink
      ? [`Para entrar no seu portal (vendas, saldo, extrato e saque), crie sua senha por este link. Ele vale 7 dias e funciona uma vez:\n${p.inviteLink}`]
      : p.loginUrl
        ? [`Para entrar no seu portal (vendas, saldo, extrato e saque), use o e-mail e a senha que você criou no cadastro:\n${p.loginUrl}`]
        : []),
    ...(p.contract ? ["No primeiro acesso, você lê e assina o contrato da parceria no próprio portal."] : []),
    "Qualquer dúvida, é só chamar por aqui.",
  ].join("\n\n");
}

/** Como cada tipo aparece na mensagem de aprovação ("sua inscrição para ser influencer da Botanika"). */
const APPROVAL_ROLE: Record<string, string> = { INFLUENCER: "influencer", PRESCRITOR: "prescritor(a)", UGC: "creator UGC" };

/** Frase do propósito de cada marca, ao fim da mensagem de aprovação (texto da Ana). Marca sem frase: sem o parágrafo. */
const BRAND_PURPOSE: Record<string, string> = {
  Botanika: "Seja muito bem-vinda à família Botanika! 💜\n\nNascemos com o propósito de cuidar da saúde das pessoas, e agora você faz parte dessa missão!",
};

/**
 * Aprovada com contrato pelo Autentique (D-AUTENTIQUE): o contrato foi para o e-mail; o cupom vem depois da assinatura.
 * Texto da Ana (2026-10-15), o mesmo para todas as marcas, trocando a marca, o tipo, o nome e o e-mail.
 */
export function contractSentMessage(p: { name: string; brand: string; email: string; category: string }): string {
  return [
    `Oi, ${firstName(p.name)}! Tudo bem? Sou a Ana, da ${p.brand}!`,
    `Temos uma notícia maravilhosa: sua inscrição para ser ${APPROVAL_ROLE[p.category] ?? "creator"} da ${p.brand} foi aprovada! 🎉 Estamos muito felizes em ter você com a gente!`,
    `Já enviamos o contrato da nossa parceria para o seu e-mail (${p.email}), pelo Autentique. É só conferir seus dados e assinar!`,
    "Assim que estiver assinado, vamos preparar seu cupom exclusivo, liberar seu acesso ao portal e organizar o envio do produto.",
    BRAND_PURPOSE[p.brand] ?? `Seja muito bem-vinda à família ${p.brand}!`,
    "Que seja o início de uma parceria incrível! ✨",
  ].join("\n\n");
}
