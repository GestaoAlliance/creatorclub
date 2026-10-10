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
