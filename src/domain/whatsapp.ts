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
export function welcomeMessage(p: { name: string; brand: string; coupon: string; discountBps: number; inviteLink: string | null; contract?: boolean }): string {
  const pct = (p.discountBps / 100).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  return [
    `Oi, ${firstName(p.name)}! Sua inscrição no Creator Club da ${p.brand} foi aprovada! 🎉`,
    `Seu cupom é *${p.coupon}*: quem comprar com ele ganha ${pct}% de desconto, e a venda fica registrada para você.`,
    ...(p.inviteLink
      ? [`Para entrar no seu portal (vendas, saldo, extrato e saque), crie sua senha por este link. Ele vale 7 dias e funciona uma vez:\n${p.inviteLink}`]
      : []),
    ...(p.contract ? ["No primeiro acesso, você lê e assina o contrato da parceria no próprio portal."] : []),
    "Qualquer dúvida, é só chamar por aqui.",
  ].join("\n\n");
}

/** Resposta gentil depois de recusar. */
export function rejectionMessage(p: { name: string; brand: string }): string {
  return [
    `Oi, ${firstName(p.name)}! Obrigada pelo interesse no Creator Club da ${p.brand}.`,
    "Neste momento não vamos seguir com a sua inscrição, mas agradecemos muito o carinho e guardamos o seu contato para próximas oportunidades.",
    "Um abraço!",
  ].join("\n\n");
}
