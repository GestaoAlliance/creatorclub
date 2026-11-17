import { addDaysKey, isDayKey } from "./time";
import { monthNamePt } from "./nf-amount";
import { nextMonthKey, previousMonthKey } from "./release";

/**
 * D-PERIODPICK (responsável, 2026-11-17): o mesmo seletor de tempo em todas as abas da equipe. Valores:
 * "m:AAAA-MM" (um mês), "30d" (últimos 30 dias), "y:AAAA" (ano) e "r:AAAA-MM-DD:AAAA-MM-DD" (datas). Padrão: o mês atual.
 * Dias locais "AAAA-MM-DD", fim incluído; a página converte para o fuso da marca.
 */
export type PeriodKind = "month" | "days" | "year" | "range";
export type PickedPeriod = { key: string; kind: PeriodKind; from: string; to: string; label: string; month: string | null };

const lastDay = (month: string) => addDaysKey(`${nextMonthKey(month)}-01`, -1);
const br = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Lê o valor do seletor; inválido ou vazio = o mês atual. Mês e ano futuros param em hoje. */
export function pickPeriod(raw: string | null | undefined, today: string): PickedPeriod {
  const key = (raw ?? "").trim();
  const thisMonth = today.slice(0, 7);
  const cut = (to: string) => (to > today ? today : to);
  let m = /^m:(\d{4}-\d{2})$/.exec(key);
  if (m && m[1]! <= thisMonth && Number(m[1]!.slice(5)) >= 1 && Number(m[1]!.slice(5)) <= 12) {
    const month = m[1]!;
    return { key, kind: "month", from: `${month}-01`, to: cut(lastDay(month)), label: `${cap(monthNamePt(month))} de ${month.slice(0, 4)}`, month };
  }
  if (key === "30d") return { key, kind: "days", from: addDaysKey(today, -29), to: today, label: "Últimos 30 dias", month: null };
  m = /^y:(\d{4})$/.exec(key);
  if (m && m[1]! <= today.slice(0, 4)) return { key, kind: "year", from: `${m[1]}-01-01`, to: cut(`${m[1]}-12-31`), label: `Ano de ${m[1]}`, month: null };
  const r = /^r:(\d{4}-\d{2}-\d{2}):(\d{4}-\d{2}-\d{2})$/.exec(key);
  if (r && isDayKey(r[1]!) && isDayKey(r[2]!) && r[1]! <= r[2]!) return { key, kind: "range", from: r[1]!, to: cut(r[2]!), label: `${br(r[1]!)} a ${br(r[2]!)}`, month: null };
  return pickPeriod(`m:${thisMonth}`, today);
}

/** Mês anterior / seguinte (o seguinte para no mês atual). Fora do modo mês, anda a partir do mês do fim do período. */
export function stepMonth(p: PickedPeriod, delta: -1 | 1, today: string): string {
  const base = p.month ?? p.to.slice(0, 7);
  const next = delta < 0 ? (p.month ? previousMonthKey(base) : base) : nextMonthKey(base);
  return `m:${next > today.slice(0, 7) ? today.slice(0, 7) : next}`;
}

export const rangeKey = (from: string, to: string) => `r:${from}:${to}`;
