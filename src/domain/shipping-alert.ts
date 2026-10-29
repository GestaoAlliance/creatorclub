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
