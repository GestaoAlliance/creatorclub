import { addDaysKey, dayKey, isDayKey, nextDayKey, startOfLocalDay } from "@/domain";

/**
 * Período das telas do portal (D-PERIOD): Hoje, Ontem, últimos 7 dias, Este mês e Personalizado, sempre em dias
 * locais da marca. `from` é o começo do primeiro dia; `to` é o começo do dia seguinte ao último (exclusivo).
 */

export type PeriodPreset = "hoje" | "ontem" | "7d" | "mes" | "custom";
export const PERIOD_PRESETS: { key: Exclude<PeriodPreset, "custom">; label: string }[] = [
  { key: "hoje", label: "Hoje" },
  { key: "ontem", label: "Ontem" },
  { key: "7d", label: "7 dias" },
  { key: "mes", label: "Este mês" },
];
export const MAX_CUSTOM_DAYS = 366;

export type Period = { preset: PeriodPreset; firstDay: string; lastDay: string; from: Date; to: Date; days: string[] };

export function resolvePeriod(input: { p?: string; de?: string; ate?: string }, now: Date, timeZone: string): Period {
  const today = dayKey(now, timeZone);
  let preset: PeriodPreset = "mes";
  let firstDay = `${today.slice(0, 8)}01`;
  let lastDay = today;
  if (input.p === "hoje") [preset, firstDay, lastDay] = ["hoje", today, today];
  else if (input.p === "ontem") [preset, firstDay, lastDay] = ["ontem", addDaysKey(today, -1), addDaysKey(today, -1)];
  else if (input.p === "7d") [preset, firstDay, lastDay] = ["7d", addDaysKey(today, -6), today];
  else if (input.p === "custom" && input.de && input.ate && isDayKey(input.de) && isDayKey(input.ate) && input.de <= input.ate) {
    const last = input.ate > today ? today : input.ate;
    const first = input.de > last ? last : input.de;
    if (addDaysKey(first, MAX_CUSTOM_DAYS - 1) >= last) [preset, firstDay, lastDay] = ["custom", first, last];
  }
  const days: string[] = [];
  for (let d = firstDay; d <= lastDay; d = nextDayKey(d)) days.push(d);
  return { preset, firstDay, lastDay, from: startOfLocalDay(firstDay, timeZone), to: startOfLocalDay(nextDayKey(lastDay), timeZone), days };
}
