/**
 * Avisos no WhatsApp de quem é Envio (D-SHIPALERT): resumo de hora em hora dos envios que entraram em "Preparando" e
 * lembrete diário (9h) dos que estão parados há 3 dias ou mais.
 */
export type ShippingAlertItem = { creator: string; items: readonly { title: string; quantity: number }[]; days?: number };

const MAX_LINES = 15;

function lines(list: readonly ShippingAlertItem[], withDays: boolean): string {
  const shown = list.slice(0, MAX_LINES).map((s) => {
    const products = s.items.map((i) => `${i.quantity}x ${i.title}`).join(", ") || "sem produtos";
    return `• ${s.creator}: ${products}${withDays && s.days !== undefined ? ` (há ${s.days} dias)` : ""}`;
  });
  if (list.length > MAX_LINES) shown.push(`… e mais ${list.length - MAX_LINES}`);
  return shown.join("\n");
}

export function shippingNewText(brand: string, list: readonly ShippingAlertItem[], link: string | null): string {
  const n = list.length;
  return [
    `*${brand}: ${n === 1 ? "1 envio novo" : `${n} envios novos`} para preparar*`,
    lines(list, false),
    link,
  ].filter(Boolean).join("\n\n");
}

export function shippingStuckText(brand: string, list: readonly ShippingAlertItem[], link: string | null): string {
  const n = list.length;
  return [
    `*${brand}: ${n === 1 ? "1 envio parado" : `${n} envios parados`} em "Preparando" há 3 dias ou mais*`,
    lines(list, true),
    "Se já saiu, marque como enviado com o rastreio.",
    link,
  ].filter(Boolean).join("\n\n");
}

/**
 * Lembretes dos saques (D-WDREMIND): para o Pagamento, os aprovados sem pagar (dia 13: faltam 2 dias; dia 15: vence
 * hoje; depois: atrasados); para a Gestão, no dia 11, os pedidos esperando a aprovação.
 */
export type WithdrawalAlertItem = { creator: string; amountCents: number };

const brl = (cents: number) => `R$ ${(cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function wdLines(list: readonly WithdrawalAlertItem[]): string {
  const shown = list.slice(0, MAX_LINES).map((w) => `• ${w.creator}: ${brl(w.amountCents)}`);
  if (list.length > MAX_LINES) shown.push(`… e mais ${list.length - MAX_LINES}`);
  return shown.join("\n");
}

export function withdrawalPayText(brand: string, list: readonly WithdrawalAlertItem[], dayOfMonth: number, link: string | null): string {
  const n = list.length;
  const what = n === 1 ? "1 saque aprovado" : `${n} saques aprovados`;
  const head =
    dayOfMonth === 13 ? `*${brand}: ${what} sem pagar. O prazo do Pix é o dia 15 (faltam 2 dias).*`
    : dayOfMonth === 15 ? `*${brand}: ${what} sem pagar. O prazo do Pix vence hoje.*`
    : `*${brand}: ${n === 1 ? "1 saque atrasado" : `${n} saques atrasados`} (o prazo era o dia 15).*`;
  const total = list.reduce((s, w) => s + w.amountCents, 0);
  return [head, wdLines(list), `Total: ${brl(total)}`, link].filter(Boolean).join("\n\n");
}

export function withdrawalApproveText(brand: string, list: readonly WithdrawalAlertItem[], link: string | null): string {
  const n = list.length;
  return [`*${brand}: ${n === 1 ? "1 saque pedido esperando" : `${n} saques pedidos esperando`} a sua aprovação.*`, wdLines(list), "Aprovados, eles vão para a Juci pagar até o dia 15.", link].filter(Boolean).join("\n\n");
}

/** D-OLIST: estoque baixo no Olist dos produtos que a creator pode escolher (Envio e Gestão, uma vez por dia). */
export function stockLowText(brand: string, list: readonly { title: string; qty: number }[], link: string | null): string {
  const lines = list.slice(0, MAX_LINES).map((p) => `• ${p.title}: ${p.qty <= 0 ? "sem estoque" : `${p.qty} ${p.qty === 1 ? "unidade" : "unidades"}`}`);
  return [`*${brand}: estoque baixo no Olist (produtos do pedido das creators)*`, lines.join("\n"), "Produto zerado some da escolha das creators até repor.", link].filter(Boolean).join("\n\n");
}
