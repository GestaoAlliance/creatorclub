/**
 * Meta de vídeos da UGC (D-UGCQUOTA, D-UGCVIDEOS): no total do ciclo, que é o período do contrato (início e fim da
 * ficha). Cada vídeo entregue é um registro com link; conta no ciclo pela data de entrega. Dias em "AAAA-MM-DD".
 */

export const UGC_DEFAULT_VIDEO_GOAL = 9;
export const UGC_MAX_VIDEO_GOAL = 100;

export const isUgc = (categories: readonly string[]) => categories.includes("UGC");

/** Só UGC (nenhum outro tipo): portal simplificado, sem saldo, saque e termo (D-UGCPORTAL). */
export const isUgcOnly = (categories: readonly string[]) => categories.length > 0 && categories.every((c) => c === "UGC");

export type UgcCycleStatus = "NO_CONTRACT" | "OPEN" | "DONE" | "MISSED";

export type UgcCycle = {
  start: string | null;
  end: string | null;
  goal: number;
  /** Vídeos entregues dentro do ciclo. */
  count: number;
  /** Vídeos registrados com data fora do ciclo (ciclo anterior ou depois do fim). */
  outside: number;
  status: UgcCycleStatus;
};

export function ugcCycle(input: { start: string | null; end: string | null; goal: number | null; videoDays: readonly string[] }, today: string): UgcCycle {
  const goal = input.goal ?? UGC_DEFAULT_VIDEO_GOAL;
  const { start, end } = input;
  if (!start || !end) return { start, end, goal, count: 0, outside: input.videoDays.length, status: "NO_CONTRACT" };
  const count = input.videoDays.filter((d) => d >= start && d <= end).length;
  const status: UgcCycleStatus = count >= goal ? "DONE" : today > end ? "MISSED" : "OPEN";
  return { start, end, goal, count, outside: input.videoDays.length - count, status };
}

/** Link do vídeo (Drive, Instagram, TikTok...): http(s), sem espaços, até 500 caracteres. */
export function normalizeVideoUrl(input: string): string | null {
  const url = input.trim();
  if (url.length > 500 || !/^https?:\/\/\S+$/i.test(url)) return null;
  return url;
}

export function isValidVideoGoal(goal: number): boolean {
  return Number.isInteger(goal) && goal >= 1 && goal <= UGC_MAX_VIDEO_GOAL;
}

const DAY_MS = 86_400_000;
const dayDiff = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / DAY_MS);

/**
 * Ritmo do ciclo da UGC (D-PERFBOARD): dias que faltam e se está atrasada. Atrasada = ciclo aberto com menos vídeos do
 * que o esperado até hoje no ritmo da meta (meta × dias passados ÷ dias do ciclo, arredondado para baixo), ou ciclo
 * encerrado sem bater a meta.
 */
export function ugcPace(c: UgcCycle, today: string): { daysLeft: number | null; expected: number | null; late: boolean } {
  if (!c.start || !c.end || c.status === "NO_CONTRACT") return { daysLeft: null, expected: null, late: false };
  if (c.status === "DONE") return { daysLeft: Math.max(0, dayDiff(today, c.end)), expected: c.goal, late: false };
  if (c.status === "MISSED") return { daysLeft: 0, expected: c.goal, late: true };
  const total = Math.max(1, dayDiff(c.start, c.end) + 1);
  const passed = Math.min(total, Math.max(0, dayDiff(c.start, today) + 1));
  const expected = Math.floor((c.goal * passed) / total);
  return { daysLeft: Math.max(0, dayDiff(today, c.end)), expected, late: c.count < expected };
}
