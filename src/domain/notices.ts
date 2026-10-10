import { formatBRL } from "./money";

/**
 * Avisos para a creator (U5, D-NOTICES): título, texto, para onde leva no portal e a chave que impede repetir.
 * O link (`path`) é relativo ao portal da marca (ex.: "/saque" vira "/portal/botanika/saque").
 */

export type NoticeKind =
  | "COMMISSION_RELEASED"
  | "KIT_AVAILABLE"
  | "SHIPPED"
  | "WITHDRAWAL_PAID"
  | "WITHDRAWAL_REJECTED"
  | "FIRST_SALE"
  | "WITHDRAWAL_WINDOW"
  | "NEAR_MINIMUM"
  | "CONTRACT_ENDING";

export type Notice = { kind: NoticeKind; dedupeKey: string; title: string; body: string; path: string | null };

const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const monthName = (m: string) => `${MONTHS[Number(m.slice(5)) - 1]} de ${m.slice(0, 4)}`;
const brl = (c: number) => formatBRL(c).replace(/ /g, " ");
const items = (n: number) => `${n} ${n === 1 ? "suplemento" : "suplementos"}`;

export const notices = {
  /** Fechamento do mês (dia 1) liberou comissão (D-CONTRACT). */
  commissionReleased: (month: string): Notice => ({
    kind: "COMMISSION_RELEASED",
    dedupeKey: `release:${month}`,
    title: "Sua comissão foi liberada",
    body: `As vendas até ${monthName(month)} chegaram ao mínimo do contrato e a comissão ficou disponível. Peça o saque do dia 1 ao dia 10, com a nota fiscal do valor total.`,
    path: "/saque",
  }),
  /** Kit do mês (D-KIT) ou de boas-vindas (D-WELCOMEKIT). */
  kitAvailable: (kind: "MONTHLY" | "WELCOME", month: string, products: number): Notice => ({
    kind: "KIT_AVAILABLE",
    dedupeKey: `kit:${kind}:${month}`,
    title: kind === "WELCOME" ? `Seu kit de boas-vindas: ${items(products)}` : `Você ganhou ${items(products)}`,
    body:
      kind === "WELCOME"
        ? "É o kit do início da sua parceria. Escolha os produtos em Envios e a equipe prepara o envio."
        : `Pelas suas vendas de ${monthName(month)}. Escolha os produtos em Envios e a equipe prepara o envio.`,
    path: "/envios",
  }),
  shipped: (shipmentId: string, carrier: string, trackingCode: string): Notice => ({
    kind: "SHIPPED",
    dedupeKey: `shipped:${shipmentId}`,
    title: "Seus produtos foram enviados",
    body: `Envio pela ${carrier}, código de rastreio ${trackingCode}. Quando chegar, toque em "Recebi" em Envios.`,
    path: "/envios",
  }),
  withdrawalPaid: (withdrawalId: string, amountCents: number): Notice => ({
    kind: "WITHDRAWAL_PAID",
    dedupeKey: `withdrawal:${withdrawalId}:paid`,
    title: "Saque pago",
    body: `O pagamento de ${brl(amountCents)} foi feito por Pix na sua chave cadastrada.`,
    path: "/saque",
  }),
  withdrawalRejected: (withdrawalId: string, amountCents: number, reason: string): Notice => ({
    kind: "WITHDRAWAL_REJECTED",
    dedupeKey: `withdrawal:${withdrawalId}:rejected`,
    title: "Seu pedido de saque precisa de ajuste",
    body: `O pedido de ${brl(amountCents)} não foi aprovado. Motivo: ${reason.trim().replace(/[.!?]?$/, ".")} O valor continua no seu saldo; corrija e peça de novo dentro da janela.`,
    path: "/saque",
  }),
  /** Janela de saque (D-CONTRACT): aberta no dia 1 e lembrete perto do fim, para quem tem saldo e não pediu. */
  withdrawalWindow: (month: string, endDay: number, availableCents: number, last: boolean): Notice => ({
    kind: "WITHDRAWAL_WINDOW",
    dedupeKey: `window:${month}:${last ? "last" : "open"}`,
    title: last ? `Faltam poucos dias para pedir seu saque` : "A janela de saque está aberta",
    body: `Você tem ${brl(availableCents)} disponível. Peça o saque até o dia ${endDay}, com a nota fiscal do valor total.`,
    path: "/saque",
  }),
  /** Passou de 70% do mínimo do contrato (uma vez por mês). */
  nearMinimum: (month: string, missingCents: number): Notice => ({
    kind: "NEAR_MINIMUM",
    dedupeKey: `near-min:${month}`,
    title: "Você está perto de liberar sua comissão",
    body: `Faltam ${brl(missingCents)} em vendas para chegar ao mínimo do contrato. Quando chegar, a comissão é liberada no fechamento do mês.`,
    path: "/vendas",
  }),
  /** 30 dias antes do fim do contrato. `end` em "AAAA-MM-DD". */
  contractEnding: (end: string): Notice => ({
    kind: "CONTRACT_ENDING",
    dedupeKey: `contract-end:${end}`,
    title: "Sua parceria está perto do fim do contrato",
    body: `O seu contrato vai até ${end.slice(8, 10)}/${end.slice(5, 7)}/${end.slice(0, 4)}. A equipe vai falar com você sobre a renovação.`,
    path: null,
  }),
  firstSale: (): Notice => ({
    kind: "FIRST_SALE",
    dedupeKey: "first-sale",
    title: "Parabéns, sua primeira venda!",
    body: "Alguém comprou com o seu cupom. Acompanhe suas vendas e a sua comissão em Vendas.",
    path: "/vendas",
  }),
};
