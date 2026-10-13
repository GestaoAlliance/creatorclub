/**
 * Mini tutoriais do portal da creator (D-TUTORIAL): o mesmo texto aparece no balão do "?" de cada cartão e no passo a
 * passo do primeiro acesso a cada tela. Textos curtos, do dia a dia; o responsável revisa (PR com capturas).
 */

export type TourScreen = "inicio" | "vendas" | "cupom" | "saque" | "envios";

export type HelpTopic = {
  title: string;
  text: string;
  /** Texto para quem é só UGC (sem comissão nem saque, D-UGCPORTAL), quando o geral não serve. */
  ugcText?: string;
};

export const HELP = {
  saldo: {
    title: "Disponível para saque",
    text: "É o dinheiro que já é seu. Do dia 1 ao 10 de cada mês você pede o saque do valor total na aba Saque e recebe por Pix.",
  },
  "a-liberar": {
    title: "A liberar",
    text: "Comissões das suas vendas esperando o fechamento do mês. No dia 1 elas viram saldo disponível quando suas vendas acumuladas chegam ao mínimo do seu contrato.",
  },
  "vendas-mes": {
    title: "Vendas do mês",
    text: "Soma dos produtos dos pedidos pagos com seu cupom neste mês, sem o frete. A venda conta no dia em que o pedido foi pago.",
  },
  "comissao-mes": {
    title: "Comissão do mês",
    text: "Quanto você já ganhou com as vendas deste mês. Olhe depois de cada post para ver o que deu resultado.",
  },
  "pedidos-mes": {
    title: "Pedidos do mês",
    text: "Quantos pedidos foram pagos com o seu cupom neste mês.",
  },
  movimentacoes: {
    title: "Últimas movimentações",
    text: "Tudo o que entra e sai do seu saldo: comissões, saques e ajustes. Se um pedido for devolvido, a comissão dele sai daqui.",
  },
  "cupom-inicio": {
    title: "Seu cupom",
    text: "Seu código para divulgar. Copie e cole nos stories, na bio e nas conversas: cada pedido pago com ele vira comissão para você.",
    ugcText: "Seu código para divulgar. Copie e cole nos stories, na bio e nas conversas: as vendas com ele aparecem em Vendas.",
  },
  periodo: {
    title: "Período",
    text: "Escolha o período: hoje, ontem, 7 dias, este mês ou as datas que quiser. Tudo na tela segue essa escolha.",
  },
  "vendas-resumo": {
    title: "Resumo do período",
    text: "Pedidos, valor vendido, sua comissão e o ticket médio (quanto cada pessoa gastou, em média).",
    ugcText: "Pedidos, valor vendido e o ticket médio (quanto cada pessoa gastou, em média).",
  },
  "vendas-grafico": {
    title: "Vendas por dia",
    text: "Suas vendas dia a dia. Compare os dias em que você postou com os outros e descubra o que mais funciona.",
  },
  "vendas-lista": {
    title: "Seus pedidos",
    text: "Cada pedido pago com seu cupom. A situação mostra se a comissão está a liberar, liberada ou estornada (devolução).",
    ugcText: "Cada pedido pago com seu cupom, com o valor dos produtos e a situação.",
  },
  "cupom-codigo": {
    title: "Seu cupom",
    text: "A pessoa digita esse código no carrinho e ganha o desconto; você ganha a comissão.",
    ugcText: "A pessoa digita esse código no carrinho e ganha o desconto. As vendas com ele aparecem em Vendas.",
  },
  "cupom-link": {
    title: "Seu link",
    text: "Com o link a pessoa já entra na loja com o cupom aplicado, sem precisar digitar. Use na bio, nos stories com link e no WhatsApp.",
  },
  "cupom-cliques": {
    title: "Cliques no link",
    text: "Quantas vezes abriram seu link. Muitos cliques e poucas vendas? Vale explicar melhor o produto no próximo post.",
  },
  "saque-saldo": {
    title: "Seu saque",
    text: "O botão Solicitar saque abre do dia 1 ao 10. O pedido é sempre do valor total disponível, e o Pix cai até o dia 15.",
  },
  "saque-nf": {
    title: "Nota fiscal",
    text: "Antes de pedir o saque, emita a nota fiscal com estes dados, no valor total disponível, e anexe o PDF no pedido.",
  },
  "saque-recibo": {
    title: "Recibo",
    text: "Como pessoa física você não emite nota: no pedido de saque confere o recibo, digita nome e CPF e aceita.",
  },
  "meus-saques": {
    title: "Meus saques",
    text: "Acompanhe cada pedido: em análise, pago ou recusado (com o motivo). Enquanto está em análise, você pode cancelar.",
  },
  extrato: {
    title: "Movimentações do mês",
    text: "Seu extrato mês a mês. Toque no mês para ver tudo o que entrou e saiu do seu saldo.",
  },
  "solicitar-pedido": {
    title: "Solicitar pedido",
    text: "Quando um kit é liberado para você, escolha aqui os produtos que quer receber. A equipe aprova e depois envia.",
  },
  endereco: {
    title: "Endereço de entrega",
    text: "É para onde mandamos seus produtos. Mudou de casa? Altere aqui antes de pedir o próximo kit.",
  },
  "meus-envios": {
    title: "Meus envios",
    text: "Acompanhe cada pedido: solicitado, aprovado, enviado e entregue. Com o rastreio você segue a entrega; quando chegar, toque em Recebi.",
  },
} as const satisfies Record<string, HelpTopic>;

export type HelpId = keyof typeof HELP;

/** Ordem dos balões no primeiro acesso a cada tela. Passo sem cartão na tela (ex.: sem gráfico) é pulado. */
export const TOURS: Record<TourScreen, HelpId[]> = {
  inicio: ["saldo", "a-liberar", "vendas-mes", "comissao-mes", "pedidos-mes", "movimentacoes", "cupom-inicio"],
  vendas: ["periodo", "vendas-resumo", "vendas-grafico", "vendas-lista"],
  cupom: ["cupom-codigo", "cupom-link", "cupom-cliques"],
  saque: ["saque-saldo", "saque-nf", "saque-recibo", "meus-saques", "extrato"],
  envios: ["solicitar-pedido", "endereco", "meus-envios"],
};

export function helpText(id: HelpId, ugc = false): string {
  const topic: HelpTopic = HELP[id];
  return ugc && topic.ugcText ? topic.ugcText : topic.text;
}

/** Tela do tutorial pela URL do portal (`/portal/<marca>/<aba>`); fora das cinco telas, nenhuma. */
export function tourScreenFor(pathname: string): TourScreen | null {
  const parts = pathname.split("/").filter(Boolean);
  if (parts[0] !== "portal" || !parts[1]) return null;
  if (parts.length === 2) return "inicio";
  if (parts.length > 3) return null;
  const tab = parts[2] as TourScreen;
  return tab in TOURS && tab !== "inicio" ? tab : null;
}

/** Passos que existem nesta tela agora (o cartão está visível). */
export function tourSteps(screen: TourScreen, present: (id: HelpId) => boolean): HelpId[] {
  return TOURS[screen].filter(present);
}

/** Chave do "já vi" por tela, guardada no navegador. Mudar a versão mostra o tutorial de novo para todas. */
export const tourSeenKey = (screen: TourScreen) => `cc-tour:v1:${screen}`;

type Rect = { top: number; left: number; bottom: number; right: number };

/**
 * Onde o balão fica: abaixo do alvo se couber, senão acima; na horizontal, alinhado ao alvo sem sair da tela
 * (margem de 16px). `bottomInset`: altura do menu fixo de baixo no celular.
 */
export function placeBalloon(
  target: Rect,
  size: { width: number; height: number },
  viewport: { width: number; height: number },
  gap = 12,
  bottomInset = 0,
): { top: number; left: number; side: "below" | "above" } {
  const margin = 16;
  const left = Math.min(Math.max(target.left, margin), Math.max(margin, viewport.width - size.width - margin));
  const below = target.bottom + gap;
  if (below + size.height <= viewport.height - bottomInset - margin) return { top: below, left, side: "below" };
  const above = target.top - gap - size.height;
  if (above >= margin) return { top: above, left, side: "above" };
  // Alvo maior que a tela: o balão fica no rodapé visível, por cima do alvo.
  return { top: Math.max(margin, viewport.height - bottomInset - margin - size.height), left, side: "below" };
}
