/**
 * D-CALENDAR: calendário de pagamentos de uma marca (pedido de saque, pagamento, fechamento) com as regras que
 * evitam data errada. Puro (testado); quem grava é `src/lib/brands/calendar.ts`.
 */

export type CalendarDays = { start: number; end: number; payFrom: number | null; payBy: number };
export type CalendarEvent = { day: number; to?: number; kind: "CLOSE" | "REQUEST" | "PAY"; label: string };

/** Confere as datas antes de salvar; lista vazia = pode salvar. Dias até 28 (todo mês tem). */
export function checkCalendar(d: CalendarDays): string[] {
  const out: string[] = [];
  const ok = (n: number) => Number.isInteger(n) && n >= 1 && n <= 28;
  if (!ok(d.start) || !ok(d.end)) out.push("Os dias do pedido de saque vão de 1 a 28.");
  else if (d.start > d.end) out.push("O pedido de saque precisa começar antes de terminar.");
  if (!ok(d.payBy) || (d.payFrom !== null && !ok(d.payFrom))) out.push("Os dias do pagamento vão de 1 a 28.");
  else if (d.payFrom !== null && d.payFrom > d.payBy) out.push("O pagamento precisa começar antes de terminar.");
  if (!out.length && d.payBy <= d.end) out.push("O prazo do pagamento precisa ser depois do fim do pedido de saque (para dar tempo de conferir as notas).");
  return out;
}

/** Até onde a janela do mês pode ir ao estender: depois do fim normal e antes do fim do pagamento. */
export function checkExtension(d: CalendarDays, normalEnd: number, newEnd: number): string | null {
  if (!Number.isInteger(newEnd) || newEnd <= normalEnd) return `Escolha um dia depois do ${normalEnd} (fim normal).`;
  if (newEnd > 28) return "O último dia possível é 28.";
  if (newEnd >= d.payBy) return `O pedido precisa fechar antes do fim do pagamento (dia ${d.payBy}).`;
  return null;
}

/** Os marcos do mês, em ordem: fechamento (dia 1), pedido de saque e pagamento. */
export function calendarEvents(d: CalendarDays): CalendarEvent[] {
  return [
    { day: 1, kind: "CLOSE" as const, label: "Fechamento: libera a comissão do mês anterior" },
    { day: d.start, to: d.end, kind: "REQUEST" as const, label: "Pedido de saque (nota ou recibo)" },
    { day: d.payFrom ?? d.end + 1, to: d.payBy, kind: "PAY" as const, label: d.payFrom ? "Pagamento" : "Prazo do pagamento" },
  ].sort((a, b) => a.day - b.day);
}

/** O que está acontecendo no dia de hoje e o próximo marco. */
export function calendarToday(d: CalendarDays, today: number): { now: string; next: string | null } {
  const payStart = d.payFrom ?? d.end + 1;
  if (today >= d.start && today <= d.end) return { now: `Pedidos de saque abertos até o dia ${d.end}`, next: `Pagamento ${d.payFrom ? `do dia ${d.payFrom} ao ${d.payBy}` : `até o dia ${d.payBy}`}` };
  if (today < d.start) return { now: `Pedidos de saque abrem no dia ${d.start}`, next: `Pedidos até o dia ${d.end}` };
  if (today >= payStart && today <= d.payBy) return { now: `Dias de pagamento (até o dia ${d.payBy})`, next: "Fechamento do mês no dia 1" };
  if (today < payStart) return { now: `Conferência das notas; pagamento a partir do dia ${payStart}`, next: `Pagamento até o dia ${d.payBy}` };
  return { now: "Fechamento do mês no dia 1", next: `Pedidos de saque do dia ${d.start} ao ${d.end}` };
}
