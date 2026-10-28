/**
 * Fila de ações por creator (M2.1, D-ACTIONS): alertas que viram tarefa para a equipe, cada uma com quem cuida e a
 * mensagem pronta para mandar pelo WhatsApp. Regra pura (testada): quem decide o que entra é `src/lib/actions/queue.ts`.
 */

export type ActionKind = "IDLE" | "CONTRACT" | "NEAR_MIN" | "KIT_PENDING" | "SHIP_STUCK" | "BIRTHDAY" | "NO_POST" | "ACCESS";

/** Quem cuida de cada tipo (decisão 3 do plano): por enquanto a Gestão (Ana) da marca; envio parado é de quem envia. */
export const ACTION_OWNER: Record<ActionKind, "GESTAO" | "ENVIO"> = {
  IDLE: "GESTAO",
  CONTRACT: "GESTAO",
  NEAR_MIN: "GESTAO",
  KIT_PENDING: "GESTAO",
  SHIP_STUCK: "ENVIO",
  BIRTHDAY: "GESTAO",
  NO_POST: "GESTAO",
  ACCESS: "GESTAO",
};

export const ACTION_LABEL: Record<ActionKind, string> = {
  IDLE: "Parou de vender",
  CONTRACT: "Contrato vencendo",
  NEAR_MIN: "Perto do mínimo",
  KIT_PENDING: "Kit sem escolher",
  SHIP_STUCK: "Envio parado",
  BIRTHDAY: "Aniversário",
  NO_POST: "Sem post",
  ACCESS: "Pediu acesso",
};

/** Prazos do kit parado (pedido do responsável em 2026-10-22). */
export const KIT_PENDING_DAYS = 7;
export const SHIP_STUCK_DAYS = 3;

const first = (name: string) => name.trim().split(/\s+/)[0] || name.trim();
const brl = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const br = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}/${day.slice(0, 4)}`;

export type ActionFacts =
  | { kind: "IDLE"; days: number }
  | { kind: "CONTRACT"; endDay: string; expired: boolean }
  | { kind: "NEAR_MIN"; missingCents: number; commission?: boolean } // D-MIN100: falta comissão (Botanika), não vendas
  | { kind: "KIT_PENDING"; days: number }
  | { kind: "SHIP_STUCK"; days: number }
  | { kind: "BIRTHDAY"; day: string; days: number }
  | { kind: "NO_POST"; days: number; never: boolean }
  | { kind: "ACCESS"; day: string };

/** O motivo curto que a equipe lê na fila. */
export function actionDetail(f: ActionFacts): string {
  switch (f.kind) {
    case "IDLE":
      return `${f.days} dias sem vender`;
    case "CONTRACT":
      return f.expired ? `contrato venceu em ${br(f.endDay)}` : `contrato vence em ${br(f.endDay)}`;
    case "NEAR_MIN":
      return `faltam ${brl(f.missingCents)} para o mínimo do mês`;
    case "KIT_PENDING":
      return `kit liberado há ${f.days} dias e ainda não escolhido`;
    case "SHIP_STUCK":
      return `envio em preparação há ${f.days} dias`;
    case "NO_POST":
      return f.never ? `nenhum post registrado há ${f.days} dias` : `último post registrado há ${f.days} dias`;
    case "ACCESS":
      return `pediu o link de acesso ao portal em ${br(f.day)} (já tinha cadastro): gere o convite na ficha`;
    case "BIRTHDAY":
      return f.days === 0 ? "faz aniversário hoje" : f.days === 1 ? `faz aniversário amanhã (${br(f.day).slice(0, 5)})` : `faz aniversário em ${f.days} dias (${br(f.day).slice(0, 5)})`;
  }
}

/** Mensagem pronta para a creator (WhatsApp); `null` quando a tarefa é interna (envio parado). */
export function actionMessage(f: ActionFacts, creatorName: string, brandName: string): string | null {
  const oi = `Oi, ${first(creatorName)}! Aqui é da ${brandName}.`;
  switch (f.kind) {
    case "IDLE":
      return `${oi} Sentimos sua falta por aqui: faz ${f.days} dias que não sai venda com o seu cupom. Quer ajuda com ideias de conteúdo ou algum material novo? Estamos aqui!`;
    case "CONTRACT":
      return f.expired
        ? `${oi} Seu contrato com a gente venceu em ${br(f.endDay)}. Quer renovar a parceria? Me conta que eu te explico os próximos passos.`
        : `${oi} Seu contrato com a gente vence em ${br(f.endDay)}. Quer renovar a parceria? Me conta que eu te explico os próximos passos.`;
    case "NEAR_MIN":
      return `${oi} Você está quase lá: faltam só ${brl(f.missingCents)} ${f.commission ? "de comissão" : "em vendas"} para liberar sua comissão deste mês. Bora divulgar o cupom nesses últimos dias?`;
    case "KIT_PENDING":
      return `${oi} Seu kit está liberado há ${f.days} dias e ainda falta você escolher os produtos no portal (aba Pedidos). Escolhe lá pra gente já mandar!`;
    case "SHIP_STUCK":
    case "ACCESS":
      return null;
    case "NO_POST":
      return `${oi} Faz ${f.days} dias que não vemos um post seu registrado no portal. Postou e esqueceu de registrar? É só colar o link em "Meus posts". Se precisar de ideia de conteúdo, me chama!`;
    case "BIRTHDAY":
      return `${oi} Feliz aniversário! 🎉 Que seu novo ano seja incrível. Obrigada por fazer parte do nosso time!`;
  }
}

/** Link do WhatsApp com a mensagem já escrita. */
export function whatsappWithText(chatUrl: string, text: string): string {
  return `${chatUrl}?text=${encodeURIComponent(text)}`;
}
