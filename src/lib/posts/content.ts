import type { PrismaClient } from "@/generated/prisma/client";
import { addDaysKey, dayKey, igKey, isUgcOnly, NO_POST_DAYS, overlapsAnother, PAID_FINANCIAL, postLift, POSTS_SINCE, postWindow, startOfLocalDay, type PostPlatform } from "@/domain";
import type { Actor } from "@/lib/auth/actor";
import { can } from "@/lib/auth/permissions";
import { PostError } from "./posts";

/**
 * Conteúdo da marca (D-CONTENTBOARD, pedido do responsável em 2026-11-11): junta os posts registrados (creator ou
 * equipe) com os que o Instagram detecta quando alguém marca a marca (`InstagramTag`). A marcação vira post da creator
 * quando o @ bate com o Instagram do cadastro dela; as outras ficam em "quem mais falou da marca". Cada post de creator
 * mostra as vendas do cupom nos 3 dias a partir do post contra o normal dos 14 dias antes (mesma régua de D-POSTS).
 * Uma marcação com o mesmo link de um post registrado não conta duas vezes.
 */

export const CONTENT_DAYS = 90;

export type ContentPost = {
  id: string;
  source: "MANUAL" | "INSTAGRAM";
  creatorId: string;
  creatorName: string;
  handle: string | null;
  url: string;
  platform: PostPlatform;
  postedDay: string;
  campaign: { id: string; name: string } | null;
  byStaff: boolean;
  likes: number | null;
  comments: number | null;
  complete: boolean;
  windowCents: number;
  normalCents: number;
  aboveCents: number;
  overlap: boolean;
};

export type Mention = { id: string; username: string; postedDay: string; url: string; likes: number | null; comments: number | null };

/** Código do post no link (instagram.com/p/XYZ ou /reel/XYZ) para não contar duas vezes. */
const shortcode = (url: string) => url.match(/instagram\.com\/(?:p|reel|reels|tv)\/([^/?#]+)/i)?.[1]?.toLowerCase() ?? null;

export async function contentBoard(prisma: PrismaClient, actor: Actor | null, brandId: string, now = new Date()) {
  if (!actor || !can(actor.grants, "creators.view", brandId)) throw new PostError("Sem permissão.");
  const brand = await prisma.brand.findUniqueOrThrow({ where: { id: brandId }, select: { timezone: true } });
  const tz = brand.timezone;
  const today = dayKey(now, tz);
  const since = addDaysKey(today, -CONTENT_DAYS);
  const [manual, tags, creators] = await Promise.all([
    prisma.creatorPost.findMany({
      where: { brandId, removedAt: null, postedDay: { gte: since } },
      orderBy: [{ postedDay: "desc" }, { createdAt: "desc" }],
      take: 1000,
      select: { id: true, creatorId: true, url: true, platform: true, postedDay: true, byStaff: true, campaign: { select: { id: true, name: true } } },
    }),
    prisma.instagramTag.findMany({ where: { brandId, postedAt: { gte: startOfLocalDay(since, tz) } }, orderBy: { postedAt: "desc" }, take: 1000 }),
    prisma.creator.findMany({
      where: { brandId, archivedAt: null },
      select: { id: true, status: true, categories: true, createdAt: true, awaitingContractAt: true, account: { select: { name: true, instagram: true, phone: true } } },
    }),
  ]);
  const byId = new Map(creators.map((c) => [c.id, c]));
  const byHandle = new Map(creators.filter((c) => igKey(c.account.instagram)).map((c) => [igKey(c.account.instagram), c]));
  const manualCodes = new Set(manual.map((p) => shortcode(p.url)).filter(Boolean));

  type Raw = Omit<ContentPost, "complete" | "windowCents" | "normalCents" | "aboveCents" | "overlap">;
  const raw: Raw[] = manual
    .filter((p) => byId.has(p.creatorId))
    .map((p) => {
      const c = byId.get(p.creatorId)!;
      return { id: p.id, source: "MANUAL", creatorId: p.creatorId, creatorName: c.account.name, handle: c.account.instagram, url: p.url, platform: p.platform as PostPlatform, postedDay: p.postedDay, campaign: p.campaign, byStaff: p.byStaff, likes: null, comments: null };
    });
  const mentions: Mention[] = [];
  for (const t of tags) {
    const c = byHandle.get(igKey(t.username));
    const day = dayKey(t.postedAt, tz);
    if (!c) {
      mentions.push({ id: t.id, username: t.username, postedDay: day, url: t.permalink, likes: t.likes, comments: t.comments });
      continue;
    }
    const code = shortcode(t.permalink);
    const twin = code ? raw.find((r) => r.source === "MANUAL" && shortcode(r.url) === code) : undefined;
    if (twin) {
      twin.likes = t.likes;
      twin.comments = t.comments;
      continue;
    }
    if (code && manualCodes.has(code)) continue;
    raw.push({ id: `ig:${t.id}`, source: "INSTAGRAM", creatorId: c.id, creatorName: c.account.name, handle: c.account.instagram, url: t.permalink, platform: "INSTAGRAM", postedDay: day, campaign: null, byStaff: false, likes: t.likes, comments: t.comments });
  }
  raw.sort((a, b) => (a.postedDay < b.postedDay ? 1 : a.postedDay > b.postedDay ? -1 : 0));

  // Vendas por creator e dia (janela de 3 dias e base de 14 dias antes de cada post).
  const ids = [...new Set(raw.map((r) => r.creatorId))];
  const byDay = new Map<string, number>();
  if (raw.length) {
    const minDay = raw.reduce((m, p) => (postWindow(p.postedDay).baseFrom < m ? postWindow(p.postedDay).baseFrom : m), "9999-12-31");
    const maxDay = raw.reduce((m, p) => (postWindow(p.postedDay).to > m ? postWindow(p.postedDay).to : m), "0000-01-01");
    const orders = await prisma.order.findMany({
      where: { brandId, test: false, cancelledAt: null, financialStatus: { in: [...PAID_FINANCIAL] }, paidAt: { gte: startOfLocalDay(minDay, tz), lt: startOfLocalDay(maxDay, tz) }, attribution: { creatorId: { in: ids } } },
      select: { subtotalCents: true, paidAt: true, attribution: { select: { creatorId: true } } },
    });
    for (const o of orders) {
      const k = `${o.attribution!.creatorId}|${dayKey(o.paidAt!, tz)}`;
      byDay.set(k, (byDay.get(k) ?? 0) + o.subtotalCents);
    }
  }
  const sum = (creatorId: string, from: string, to: string) => {
    let t = 0;
    for (let d = from; d < to; d = addDaysKey(d, 1)) t += byDay.get(`${creatorId}|${d}`) ?? 0;
    return t;
  };
  const posts: ContentPost[] = raw.map((p, i) => {
    const w = postWindow(p.postedDay);
    const others = raw.filter((q, j) => j !== i && q.creatorId === p.creatorId).map((q) => q.postedDay);
    return { ...p, complete: today >= w.to, ...postLift(sum(p.creatorId, w.from, w.to), sum(p.creatorId, w.baseFrom, w.from)), overlap: overlapsAnother(p.postedDay, others) };
  });

  // Quem não postou: parceiras ativas (não só UGC) sem post (registrado ou detectado) há 15+ dias.
  const last = new Map<string, string>();
  for (const p of posts) if (!last.has(p.creatorId) || p.postedDay > last.get(p.creatorId)!) last.set(p.creatorId, p.postedDay);
  const older = await lastPostDaysAll(prisma, brandId, creators.map((c) => c.id), tz);
  const notPosted = creators
    .filter((c) => c.status === "ACTIVE" && !c.awaitingContractAt && !isUgcOnly(c.categories as string[]))
    .map((c) => {
      const lastDay = [last.get(c.id), older.get(c.id)].filter(Boolean).sort().at(-1) ?? null;
      const from = [lastDay ?? POSTS_SINCE, POSTS_SINCE, dayKey(c.createdAt, tz)].sort().at(-1)!;
      const days = Math.floor((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
      return { id: c.id, name: c.account.name, hasPhone: Boolean(c.account.phone), lastDay, days };
    })
    .filter((c) => c.days >= NO_POST_DAYS)
    .sort((a, b) => b.days - a.days);

  return { posts, mentions, notPosted, names: new Map(creators.map((c) => [c.id, c.account.name])) };
}

/**
 * Último post de cada creator, registrado ou detectado no Instagram (D-CONTENTBOARD): usado também na fila de ações
 * ("Sem post"). Marcação conta quando o @ bate com o Instagram do cadastro.
 */
export async function lastPostDaysAll(prisma: PrismaClient, brandId: string | null, creatorIds: readonly string[], timeZone = "America/Sao_Paulo") {
  const out = new Map<string, string>();
  if (!creatorIds.length) return out;
  const [manual, creators] = await Promise.all([
    prisma.creatorPost.groupBy({ by: ["creatorId"], where: { creatorId: { in: [...creatorIds] }, removedAt: null }, _max: { postedDay: true } }),
    prisma.creator.findMany({ where: { id: { in: [...creatorIds] } }, select: { id: true, brandId: true, account: { select: { instagram: true } } } }),
  ]);
  for (const r of manual) out.set(r.creatorId, r._max.postedDay!);
  const withHandle = creators.filter((c) => igKey(c.account.instagram));
  if (withHandle.length) {
    const brands = brandId ? [brandId] : [...new Set(withHandle.map((c) => c.brandId))];
    const tags = await prisma.instagramTag.groupBy({ by: ["brandId", "username"], where: { brandId: { in: brands } }, _max: { postedAt: true } });
    const tagLast = new Map(tags.map((t) => [`${t.brandId}|${igKey(t.username)}`, t._max.postedAt!]));
    for (const c of withHandle) {
      const at = tagLast.get(`${c.brandId}|${igKey(c.account.instagram)}`);
      if (!at) continue;
      const day = dayKey(at, timeZone);
      if (!out.has(c.id) || day > out.get(c.id)!) out.set(c.id, day);
    }
  }
  return out;
}
