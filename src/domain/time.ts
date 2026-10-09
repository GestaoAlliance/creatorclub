/**
 * Datas são gravadas em UTC; tudo que é "dia" ou "mês" de negócio é calculado
 * no fuso da marca (padrão America/Sao_Paulo).
 */

export const DEFAULT_TIMEZONE = "America/Sao_Paulo";

export type LocalDate = { year: number; month: number; day: number };

export function localDate(at: Date, timeZone: string = DEFAULT_TIMEZONE): LocalDate {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(at);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { year: get("year"), month: get("month"), day: get("day") };
}

/** "AAAA-MM-DD" do dia local de uma data, no fuso da marca. */
export function dayKey(at: Date, timeZone: string = DEFAULT_TIMEZONE): string {
  const { year, month, day } = localDate(at, timeZone);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function isDayKey(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/** Instante UTC em que começa o dia local "AAAA-MM-DD" no fuso dado (funciona com horário de verão). */
export function startOfLocalDay(key: string, timeZone: string = DEFAULT_TIMEZONE): Date {
  const [y, m, d] = key.split("-").map(Number) as [number, number, number];
  let guess = Date.UTC(y, m - 1, d, 0, 0, 0);
  for (let i = 0; i < 2; i++) {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
    }).formatToParts(new Date(guess));
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
    const shown = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
    guess -= shown - Date.UTC(y, m - 1, d, 0, 0, 0);
  }
  return new Date(guess);
}

/** Dia seguinte a "AAAA-MM-DD" (calendário, sem fuso). */
export function nextDayKey(key: string): string {
  const d = new Date(`${key}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export function addDaysKey(key: string, days: number): string {
  const d = new Date(`${key}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
