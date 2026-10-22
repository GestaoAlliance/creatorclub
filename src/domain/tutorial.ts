/**
 * Mini tutoriais do portal da creator e das telas da equipe (D-TUTORIAL): o mesmo texto aparece no balão do "?" de
 * cada cartão e no passo a passo do primeiro acesso a cada tela. Textos curtos, do dia a dia; o responsável revisa
 * (PR com capturas). Passo de botão que a pessoa não tem (pelo papel) não aparece, porque o botão não está na tela.
 */

export type PortalScreen = "inicio" | "vendas" | "saque" | "envios";
export type StaffScreen =
  | "equipe-inicio"
  | "equipe-candidatas"
  | "equipe-creators"
  | "equipe-ficha"
  | "equipe-cupons"
  | "equipe-envios"
  | "equipe-saques"
  | "equipe-desempenho";
export type TourScreen = PortalScreen | StaffScreen;

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
  aguardando: {
    title: "Aguardando pagamento",
    text: "Pedidos com o seu cupom ainda não pagos (Pix ou boleto). Quando pagam, entram nas vendas e geram comissão; se não pagam, somem daqui.",
  },
  "ja-usado": {
    title: "Já usado",
    text: "Tudo o que você já sacou do seu saldo nesta marca.",
  },
  "minimo-mes": {
    title: "Mínimo do contrato",
    text: "No dia 1 a comissão vira saldo se as suas vendas acumuladas chegarem ao mínimo do contrato. A barra mostra quanto falta.",
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
  // ——— Equipe ———
  "eq-indicacoes": {
    title: "Minhas indicações",
    text: "Cliques no seu link nos últimos 30 dias e quantas indicadas estão em análise ou já aprovadas. Toque para ver a lista.",
  },
  "eq-candidatas": {
    title: "Candidatas",
    text: "Quem respondeu o formulário de inscrição e espera resposta. Abra para aprovar ou recusar; aprovar cria a creator e segue para o contrato.",
  },
  "eq-contratos": {
    title: "Contratos",
    text: "Creators com contrato vencendo nos próximos 30 dias ou já vencido. Abra para renovar ou encerrar.",
  },
  "eq-semvender": {
    title: "Sem vender",
    text: "Creators ativas há 60 dias ou mais sem nenhuma venda pelo cupom. Vale uma conversa para entender o que travou.",
  },
  "eq-saques": {
    title: "Saques",
    text: "Para aprovar: a Gestão confere a nota. Para pagar: o Pagamento faz o Pix. Aberturas a aprovar são saldos antigos travados até aprovar.",
  },
  "eq-envios": {
    title: "Envios",
    text: "Pedidos de kit das creators: a Gestão aprova, o Envio prepara e manda com o rastreio. Os números mostram em que etapa cada um está.",
  },
  "eq-cupons": {
    title: "Cupons",
    text: "Cupons que ainda precisam de tipo (creator ou promocional) ou de dona confirmada. Enquanto isso, os pedidos deles ficam pendentes.",
  },
  "eq-creators": {
    title: "Creators",
    text: "Todas as creators da marca. A conferir pela Ana são as que esperam a conferência que libera o saldo de abertura.",
  },
  "cand-abas": {
    title: "Situação",
    text: "Pendentes esperam sua decisão; Aprovadas e Recusadas ficam guardadas para consulta. O número mostra quantas há em cada uma.",
  },
  "cand-filtros": {
    title: "Busca e filtros",
    text: "Escolha a origem nas abas, procure pelo nome, @ ou e-mail e filtre por tipo, hunter ou marca. Mais antigas primeiro mostra quem espera há mais tempo.",
  },
  "cand-lista": {
    title: "Lista de candidatas",
    text: "Aprovar abre cupom, tipo, comissão e desconto já preenchidos para conferir; Recusar pede só o motivo. Toque na linha para ver tudo o que ela respondeu.",
  },
  "cr-filtros": {
    title: "Busca e filtros",
    text: "Busque pelo nome e filtre por categoria. As caixas mostram só quem tem pendência, contrato vencendo ou está sem vender.",
  },
  "cr-lista": {
    title: "Lista de creators",
    text: "Cada creator com a situação, a categoria e o último pedido. Etiquetas amarelas são pendências; toque para abrir a ficha.",
  },
  "fi-vercomo": {
    title: "Ver o portal como ela",
    text: "Abre o portal exatamente como a creator vê, só para leitura. Ajuda a tirar dúvidas dela pelo WhatsApp.",
  },
  "fi-saldo": {
    title: "Saldo",
    text: "Vem do extrato dela. A liberar vira disponível no dia 1 quando as vendas acumuladas chegam ao mínimo do contrato.",
  },
  "fi-conferencia": {
    title: "Conferência da Ana",
    text: "Depois de conferir cupons, taxa e vendas, marque aqui. Isso libera o saldo de abertura para o Pagamento.",
  },
  "fi-cupons": {
    title: "Cupom, comissão e desconto",
    text: "O cupom dela e o link. Em Editar, mude a comissão (vale daqui pra frente) e o desconto do cupom (muda na Shopify na hora).",
  },
  "fi-contrato": {
    title: "Contrato e checklist",
    text: "Modelo, datas do contrato e o checklist. Os avisos em amarelo ou vermelho mostram contrato vencendo ou dias sem vender.",
  },
  "fi-extrato": {
    title: "Extrato",
    text: "Tudo o que entrou e saiu do saldo dela, mês a mês. É a mesma lista que ela vê no portal.",
  },
  "fi-taxa": {
    title: "Taxa de comissão",
    text: "A porcentagem que ela ganha em cada venda e desde quando vale. Cada pedido usa a taxa do dia em que foi pago.",
  },
  "fi-autentique": {
    title: "Contrato pelo Autentique",
    text: "Envie o contrato para assinatura e acompanhe. Quando ela assina, o cupom é criado e o kit de boas-vindas é liberado.",
  },
  "fi-ajustes": {
    title: "Ajustes manuais",
    text: "Correções de saldo, sempre como um lançamento novo com o motivo. Nada é apagado do extrato.",
  },
  "cp-resumo": {
    title: "Resumo dos cupons",
    text: "Quantas creators ativas já têm cupom, dona e taxa confirmados, e quantos cupons há de cada tipo.",
  },
  "cp-abas": {
    title: "Abas e busca",
    text: "A conferir é o trabalho a fazer; Creators e Promocionais são para consulta. A busca acha pelo cupom ou pelo nome da dona.",
  },
  "cp-conferir": {
    title: "Conferir um cupom",
    text: "Primeiro diga se é de creator ou promocional, depois confirme a dona e a taxa. Cupom promocional nunca gera comissão.",
  },
  "en-aviso": {
    title: "Pedidos esperando aprovação",
    text: "Pedidos que as creators fizeram pelo portal. Toque para ver só eles.",
  },
  "en-novo": {
    title: "Novo envio",
    text: "Para mandar produtos fora do pedido da creator. Envio criado aqui não passa pela aprovação.",
  },
  "en-situacao": {
    title: "Situação",
    text: "Filtre os envios pela etapa: aguardando aprovação, preparando, enviado, entregue ou cancelado.",
  },
  "en-cartao": {
    title: "Cada envio",
    text: "A creator, os produtos e o endereço de entrega. Quando ela confirma no portal, aparece confirmado pela creator.",
  },
  "en-aprovar": {
    title: "Aprovar pedido",
    text: "Confira os produtos e aprove: o pedido vai para Preparando, na fila do Envio. Se recusar, escreva o motivo: a creator vê e escolhe de novo.",
  },
  "en-enviado": {
    title: "Marcar enviado",
    text: "Depois de postar, informe a transportadora e o código de rastreio. A creator acompanha a entrega pelo portal.",
  },
  "sq-abas": {
    title: "Situação",
    text: "Em análise: a Gestão confere e aprova. Aprovados: o Pagamento faz o Pix. Decididos guarda os pagos e os recusados.",
  },
  "sq-resumo": {
    title: "Comissão a pagar",
    text: "Sacável (liberado e não pedido), pedidos em análise e aprovados, o que espera o fechamento do mês e as vendas ainda sem pagamento.",
  },
  "sq-cartao": {
    title: "Pedido de saque",
    text: "O selo mostra se o sistema conferiu a nota; \"Conferir de novo\" lê outra vez. Valor acima do saldo aparece em vermelho.",
  },
  "sq-pagar": {
    title: "Aprovar ou pagar",
    text: "A Gestão aprova; o Pagamento marca como pago só depois do Pix. Se algo não bate, recuse com o motivo: a creator vê.",
  },
  "de-filtros": {
    title: "Filtros",
    text: "Escolha o mês, o tipo de creator e a ordem. Mais perto do mínimo mostra quem está quase liberando a comissão.",
  },
  "de-resumo": {
    title: "Resumo do mês",
    text: "Vendas e pedidos pelo cupom no mês, quantas creators venderam e quantas já chegaram ao mínimo do contrato.",
  },
  "de-grupos": {
    title: "Grupos",
    text: "Influencers e prescritores ganham comissão; UGC é permuta e fica à parte, com a meta de vídeos.",
  },
  "de-ranking": {
    title: "Ranking",
    text: "Cada creator com vendas, pedidos, quanto falta para o mínimo e a faixa do kit. Toque no nome para abrir a ficha.",
  },
} as const satisfies Record<string, HelpTopic>;

export type HelpId = keyof typeof HELP;

/** Ordem dos balões no primeiro acesso a cada tela. Passo sem cartão na tela (ex.: sem gráfico) é pulado. */
export const TOURS: Record<TourScreen, HelpId[]> = {
  inicio: ["saldo", "a-liberar", "aguardando", "ja-usado", "vendas-mes", "comissao-mes", "pedidos-mes", "minimo-mes", "cupom-codigo", "cupom-link", "cupom-cliques", "movimentacoes"],
  vendas: ["periodo", "vendas-resumo", "vendas-grafico", "vendas-lista"],
  saque: ["saque-saldo", "saque-nf", "saque-recibo", "meus-saques", "extrato"],
  envios: ["solicitar-pedido", "endereco", "meus-envios"],
  "equipe-inicio": ["eq-indicacoes", "eq-candidatas", "eq-contratos", "eq-semvender", "eq-saques", "eq-envios", "eq-cupons", "eq-creators"],
  "equipe-candidatas": ["cand-abas", "cand-filtros", "cand-lista"],
  "equipe-creators": ["cr-filtros", "cr-lista"],
  "equipe-ficha": ["fi-vercomo", "fi-saldo", "fi-conferencia", "fi-cupons", "fi-contrato", "fi-extrato", "fi-taxa", "fi-autentique", "fi-ajustes"],
  "equipe-cupons": ["cp-resumo", "cp-abas", "cp-conferir"],
  "equipe-envios": ["en-aviso", "en-novo", "en-situacao", "en-cartao", "en-aprovar", "en-enviado"],
  "equipe-saques": ["sq-abas", "sq-resumo", "sq-cartao", "sq-pagar"],
  "equipe-desempenho": ["de-filtros", "de-resumo", "de-grupos", "de-ranking"],
};

const STAFF_SCREENS: Record<string, StaffScreen> = {
  marca: "equipe-inicio",
  candidatas: "equipe-candidatas",
  creators: "equipe-creators",
  cupons: "equipe-cupons",
  envios: "equipe-envios",
  saques: "equipe-saques",
  desempenho: "equipe-desempenho",
};

export function helpText(id: HelpId, ugc = false): string {
  const topic: HelpTopic = HELP[id];
  return ugc && topic.ugcText ? topic.ugcText : topic.text;
}

/** Tela do tutorial pela URL (`/portal/<marca>/<aba>` ou `/admin/<tela>`); fora das telas com tutorial, nenhuma. */
export function tourScreenFor(pathname: string): TourScreen | null {
  const parts = pathname.split("/").filter(Boolean);
  if (parts[0] === "admin") {
    if (parts[1] === "creators" && parts.length === 3) return "equipe-ficha";
    return parts.length === 2 ? (STAFF_SCREENS[parts[1]!] ?? null) : null;
  }
  if (parts[0] !== "portal" || !parts[1]) return null;
  if (parts.length === 2) return "inicio";
  if (parts.length > 3) return null;
  const tab = parts[2] as TourScreen;
  return ["vendas", "saque", "envios"].includes(tab) ? tab : null;
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
