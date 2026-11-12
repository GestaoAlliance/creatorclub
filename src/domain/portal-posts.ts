/**
 * Meus posts no portal (D-PORTALPOSTS). Regras puras: formato do post, melhor formato e melhor dia (pela comissão),
 * sequência de semanas postando, semanas com post x sem post, ideias de post da semana e o dia de um vídeo do TikTok
 * pelo próprio link.
 */

import type { PostPlatform } from "./posts";
import { addDaysKey, dayKey } from "./time";

export type PostFormat = "Reels" | "Foto ou carrossel" | "TikTok" | "YouTube" | "Outro";

/** Código do post do Instagram no link (instagram.com/p/XYZ, /reel/XYZ): para não contar o mesmo post duas vezes. */
export const igShortcode = (url: string) => url.match(/instagram\.com\/(?:[^/]+\/)?(?:p|reel|reels|tv)\/([^/?#]+)/i)?.[1]?.toLowerCase() ?? null;

/** Formato pelo tipo do Instagram (quando o sistema leu o post) ou pelo link. */
export function postFormat(url: string, platform: PostPlatform, ig: { mediaType: string; productType: string | null } | null = null): PostFormat {
  if (platform === "TIKTOK") return "TikTok";
  if (platform === "YOUTUBE") return "YouTube";
  if (platform !== "INSTAGRAM") return "Outro";
  if (ig) return ig.productType === "REELS" || ig.mediaType === "VIDEO" ? "Reels" : "Foto ou carrossel";
  return /instagram\.com\/(?:[^/]+\/)?(?:reel|reels|tv)\//i.test(url) ? "Reels" : "Foto ou carrossel";
}

type Scored = { postedDay: string; format: PostFormat; commissionCents: number; complete: boolean };
const WEEKDAY = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

/**
 * O que mais vende para ela: média de comissão por post (janela completa) por formato e por dia da semana. Só aparece
 * com 2+ posts em pelo menos 2 formatos (ou 2 dias); o melhor precisa ficar acima da média geral.
 */
export function postInsights(posts: readonly Scored[]): { format: { name: PostFormat; avgCents: number; posts: number } | null; weekday: { name: string; avgCents: number; posts: number } | null } {
  const done = posts.filter((p) => p.complete);
  const pick = <K extends string>(key: (p: Scored) => K) => {
    const g = new Map<K, number[]>();
    for (const p of done) g.set(key(p), [...(g.get(key(p)) ?? []), p.commissionCents]);
    const groups = [...g].filter(([, v]) => v.length >= 2).map(([name, v]) => ({ name, avgCents: Math.round(v.reduce((a, b) => a + b, 0) / v.length), posts: v.length }));
    if (groups.length < 2) return null;
    const best = groups.sort((a, b) => b.avgCents - a.avgCents || b.posts - a.posts)[0]!;
    return best.avgCents > 0 ? best : null;
  };
  return { format: pick((p) => p.format), weekday: pick((p) => WEEKDAY[new Date(`${p.postedDay}T12:00:00Z`).getUTCDay()]! as string) };
}

/** Segunda-feira da semana de um dia. */
export const weekStart = (day: string) => addDaysKey(day, -((new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7));

/**
 * Últimas `n` semanas (segunda a domingo; a mais antiga primeiro) com ou sem post, e a sequência: semanas seguidas
 * postando até a atual (a semana atual ainda sem post não quebra a sequência).
 */
export function weekStreak(postDays: readonly string[], today: string, n = 8): { weeks: { start: string; posted: boolean }[]; streak: number } {
  const set = new Set(postDays.map(weekStart));
  const cur = weekStart(today);
  const weeks = Array.from({ length: n }, (_, i) => {
    const start = addDaysKey(cur, -7 * (n - 1 - i));
    return { start, posted: set.has(start) };
  });
  let streak = 0;
  for (let w = set.has(cur) ? cur : addDaysKey(cur, -7); set.has(w); w = addDaysKey(w, -7)) streak++;
  return { weeks, streak };
}

/**
 * Semana em que posta x semana em que não posta (comissão média por semana, últimas semanas fechadas). Só com 2+
 * semanas de cada lado.
 */
export function postingWeeks(weeks: readonly { posted: boolean; commissionCents: number }[]): { withCents: number; withoutCents: number } | null {
  const yes = weeks.filter((w) => w.posted);
  const no = weeks.filter((w) => !w.posted);
  if (yes.length < 2 || no.length < 2) return null;
  const avg = (l: readonly { commissionCents: number }[]) => Math.round(l.reduce((s, w) => s + w.commissionCents, 0) / l.length);
  return { withCents: avg(yes), withoutCents: avg(no) };
}

const IDEAS = [
  (p: string) => `Mostre o ${p} na sua rotina da manhã, do jeito que você usa de verdade.`,
  (p: string) => `Conte há quanto tempo usa o ${p} e o que mudou para você.`,
  (p: string) => `Responda a dúvida que mais te mandam sobre o ${p}.`,
  (p: string) => `Faça um "o que tem na minha bolsa/necessaire" com o ${p}.`,
  (p: string) => `Grave um antes e depois (ou dia 1 e dia 30) com o ${p}.`,
  (p: string) => `Compare o ${p} com o que você usava antes, sem citar marca.`,
];

/** 3 ideias da semana: a campanha da vez (se houver) e os produtos que mais vendem para ela; mudam toda semana. */
export function postIdeas(products: readonly string[], campaign: string | null, week: number, fallback: string): string[] {
  const list = products.length ? products : [fallback];
  const out: string[] = [];
  if (campaign) out.push(`Post para a campanha ${campaign}: lembre o seu cupom e o prazo da campanha.`);
  for (let i = 0; out.length < 3; i++) out.push(IDEAS[(week + i) % IDEAS.length]!(list[(week + i) % list.length]!));
  return out;
}

/** Dia do vídeo do TikTok pelo número do vídeo no link (os primeiros 32 bits são a hora em segundos). */
export function tiktokDay(url: string, timeZone: string): string | null {
  const id = url.match(/tiktok\.com\/.*\/video\/(\d{15,22})/i)?.[1];
  if (!id) return null;
  const seconds = Number(BigInt(id) >> 32n);
  if (seconds < 1_451_606_400) return null; // antes de 2016: não é um número de vídeo
  return dayKey(new Date(seconds * 1000), timeZone);
}
