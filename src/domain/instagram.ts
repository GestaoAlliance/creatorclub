/**
 * Instagram automático (M5.3, D-INSTAGRAM): contas feitas sobre o que a API oficial da Meta devolve de cada perfil
 * profissional (seguidores e últimos posts, consultados pela conta da marca). Taxas em pontos-base (1 = 0,01%),
 * nunca Float guardado. Nada aqui chama a Meta.
 */

export type IgMediaType = "IMAGE" | "VIDEO" | "CAROUSEL_ALBUM";

export type IgPost = {
  id: string;
  /** Instante do post (UTC). */
  at: Date;
  type: IgMediaType;
  /** Reels chegam como VIDEO com productType "REELS". */
  productType?: string | null;
  likes: number;
  comments: number;
  caption: string | null;
  permalink: string;
};

export type IgFormat = "REELS" | "CAROUSEL" | "IMAGE" | "VIDEO";
export const IG_FORMAT_LABEL: Record<IgFormat, string> = { REELS: "Reels", CAROUSEL: "Carrossel", IMAGE: "Foto", VIDEO: "Vídeo" };

/** Queda de engajamento que vira alerta para a Gestão (resposta do responsável em 2026-10-28). */
export const ENGAGEMENT_DROP_BPS = 4000;
/** Janelas do alerta: últimos 30 dias contra a média dos 90 dias anteriores. */
export const RECENT_DAYS = 30;
export const BASELINE_DAYS = 90;
/** Mínimo de posts em cada janela para comparar (com menos, não dá para dizer que caiu). */
export const MIN_POSTS_TO_COMPARE = 3;

const DAY = 86_400_000;

export function igFormat(p: Pick<IgPost, "type" | "productType">): IgFormat {
  if (p.type === "CAROUSEL_ALBUM") return "CAROUSEL";
  if (p.type === "VIDEO") return p.productType?.toUpperCase() === "REELS" ? "REELS" : "VIDEO";
  return "IMAGE";
}

/** Engajamento médio por post: (curtidas + comentários) / seguidores, em pontos-base. Sem seguidores ou posts: null. */
export function engagementBps(posts: readonly Pick<IgPost, "likes" | "comments">[], followers: number): number | null {
  if (!posts.length || followers <= 0) return null;
  const total = posts.reduce((s, p) => s + Math.max(0, p.likes) + Math.max(0, p.comments), 0);
  return Math.round((total * 10_000) / (posts.length * followers));
}

const within = (posts: readonly IgPost[], from: Date, to: Date) => posts.filter((p) => p.at >= from && p.at < to);

/** Posts por semana nos últimos `days` dias, em centésimos (250 = 2,5 por semana). */
export function postsPerWeekX100(posts: readonly IgPost[], now: Date, days = 28): number {
  const n = within(posts, new Date(now.getTime() - days * DAY), new Date(now.getTime() + 1)).length;
  return Math.round((n * 7 * 100) / days);
}

export function lastPostAt(posts: readonly IgPost[]): Date | null {
  return posts.reduce<Date | null>((m, p) => (!m || p.at > m ? p.at : m), null);
}

/** Formato com o maior engajamento médio (pelo menos 2 posts do formato). */
export function bestFormat(posts: readonly IgPost[], followers: number): { format: IgFormat; bps: number } | null {
  const groups = new Map<IgFormat, IgPost[]>();
  for (const p of posts) groups.set(igFormat(p), [...(groups.get(igFormat(p)) ?? []), p]);
  let best: { format: IgFormat; bps: number } | null = null;
  for (const [format, list] of groups) {
    if (list.length < 2) continue;
    const bps = engagementBps(list, followers);
    if (bps !== null && (!best || bps > best.bps)) best = { format, bps };
  }
  return best;
}

/**
 * Queda de engajamento: últimos 30 dias contra os 90 anteriores. Devolve a queda em pontos-base (4000 = caiu 40%)
 * quando há posts suficientes nas duas janelas; senão null. `alert` = caiu pelo menos ENGAGEMENT_DROP_BPS.
 */
export function engagementDrop(posts: readonly IgPost[], followers: number, now: Date): { dropBps: number; alert: boolean } | null {
  const recentFrom = new Date(now.getTime() - RECENT_DAYS * DAY);
  const recent = within(posts, recentFrom, new Date(now.getTime() + 1));
  const base = within(posts, new Date(recentFrom.getTime() - BASELINE_DAYS * DAY), recentFrom);
  if (recent.length < MIN_POSTS_TO_COMPARE || base.length < MIN_POSTS_TO_COMPARE) return null;
  const r = engagementBps(recent, followers);
  const b = engagementBps(base, followers);
  if (r === null || b === null || b === 0) return null;
  const dropBps = Math.round(((b - r) * 10_000) / b);
  return { dropBps, alert: dropBps >= ENGAGEMENT_DROP_BPS };
}

/** Vendas (centavos) a cada mil seguidores, em centavos. */
export function salesPerThousandFollowers(salesCents: number, followers: number): number | null {
  return followers > 0 ? Math.round((salesCents * 1000) / followers) : null;
}

/** A legenda cita o cupom (palavra inteira, sem diferença de maiúsculas e acento). */
export function captionHasCoupon(caption: string | null | undefined, code: string): boolean {
  const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
  const c = norm(code.trim());
  if (!caption || !c) return false;
  const escaped = c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^A-Z0-9])${escaped}($|[^A-Z0-9])`).test(norm(caption));
}

/** Crescimento de seguidores entre a primeira e a última leitura do período. */
export function followerGrowth(snapshots: readonly { day: string; followers: number }[]): { from: number; to: number; delta: number } | null {
  if (snapshots.length < 2) return null;
  const s = [...snapshots].sort((a, b) => a.day.localeCompare(b.day));
  const from = s[0]!.followers;
  const to = s[s.length - 1]!.followers;
  return { from, to, delta: to - from };
}
