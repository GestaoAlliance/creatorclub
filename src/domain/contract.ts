import { DEFAULT_TIMEZONE, dayKey } from "./time";

/**
 * Vigência do contrato (D-CONTRACT, D-CHECKLIST): 6 meses (UGC 3) a partir do início. Aviso 30 dias antes do fim e
 * no vencimento; o sistema nunca desliga a creator sozinho.
 */

export const CONTRACT_WARN_DAYS = 30;

/** "AAAA-MM-DD" somando meses; dia que não existe no mês de destino vira o último dia (31/08 + 6 = 28/02). */
export function addMonthsToDay(day: string, months: number): string {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  const last = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  return `${ny}-${String(nm).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
}

export function contractMonthsFor(categories: readonly string[]): number {
  return categories.length > 0 && categories.every((c) => c === "UGC") ? 3 : 6;
}

export type ContractStatus = "NONE" | "ACTIVE" | "EXPIRING" | "EXPIRED";

/** Situação do contrato hoje (dia no fuso da marca). `end` em "AAAA-MM-DD". */
export function contractStatus(end: string | null, now: Date, timeZone: string = DEFAULT_TIMEZONE): { status: ContractStatus; daysLeft: number | null } {
  if (!end) return { status: "NONE", daysLeft: null };
  const today = dayKey(now, timeZone);
  const daysLeft = Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  if (daysLeft <= 0) return { status: "EXPIRED", daysLeft };
  if (daysLeft <= CONTRACT_WARN_DAYS) return { status: "EXPIRING", daysLeft };
  return { status: "ACTIVE", daysLeft };
}

/** D-IDLE60: a equipe é avisada quando a creator ativa passa este tanto de dias sem vender (nada é encerrado sozinho). */
export const IDLE_WARN_DAYS = 60;

/**
 * Dias sem vender, contados da última venda; quem nunca vendeu conta desde o início do contrato (sem data na ficha,
 * desde a entrada no sistema). Dias em "AAAA-MM-DD" no fuso da marca.
 */
export function idleStatus(
  lastSaleDay: string | null,
  startDay: string,
  now: Date,
  timeZone: string = DEFAULT_TIMEZONE,
): { days: number; idle: boolean; lastSaleDay: string | null } {
  const from = lastSaleDay ?? startDay;
  const days = Math.max(0, Math.round((Date.parse(`${dayKey(now, timeZone)}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000));
  return { days, idle: days >= IDLE_WARN_DAYS, lastSaleDay };
}
