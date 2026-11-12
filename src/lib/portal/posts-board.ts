import type { PrismaClient } from "@/generated/prisma/client";
import {
  addDaysKey,
  dayKey,
  igShortcode,
  monthKey,
  overlapsAnother,
  PAID_FINANCIAL,
  postFormat,
  postIdeas,
  postingWeeks,
  postInsights,
  postLift,
  postWindow,
  startOfLocalDay,
  weekStart,
  weekStreak,
  type PostFormat,
  type PostPlatform,
} from "@/domain";
import type { PortalContext } from "./context";

/**
 * Meus posts (D-PORTALPOSTS, pedido do responsável em 2026-11-12): os posts que ela registrou e os que o Instagram
 * detectou quando ela marcou a marca (o @ do cadastro), sem contar o mesmo post duas vezes. Cada post mostra a
 * **comissão** e os pedidos nos 3 dias a partir do post contra o normal dos 14 dias antes (régua de D-POSTS, em
 * comissão: o total vendido não aparece, D-PORTALSALES). Mais: resumo do mês, sequência de semanas, semanas com post
 * x sem post, melhor formato e dia, os 3 posts que mais deram comissão e ideias da semana.
 */

export type MyPost = {
  id: string;
  source: "MANUAL" | "INSTAGRAM";
  url: string;
  platform: PostPlatform;
  format: PostFormat;
  postedDay: string;
  campaign: { id: string; name: string } | null;
  byStaff: boolean;
  likes: number | null;
  comments: number | null;
  complete: boolean;
  commissionCents: number;
  orders: number;
  normalCents: number;
  aboveCents: number;
  overlap: boolean;
};

const WEEKS_BACK = 12;
const igKey = (h: string | null | undefined) => (h ? h.trim().replace(/^@+/, "").toLowerCase() : "");

export async function portalPostsBoard(prisma: PrismaClient, ctx: PortalContext, now = new Date()) {
  const [{ timezone: tz }, me] = await Promise.all([
    prisma.brand.findUniqueOrThrow({ where: { id: ctx.brand.id }, select: { timezone: true } }),
    prisma.creator.findUniqueOrThrow({ where: { id: ctx.creatorId }, select: { accountId: true, account: { select: { instagram: true } } } }),
  ]);
  const today = dayKey(now, tz);
  const handle = igKey(me.account.instagram);
  const [manual, tags, igPosts] = await Promise.all([
    prisma.creatorPost.findMany({
      where: { creatorId: ctx.creatorId, brandId: ctx.brand.id, removedAt: null },
      orderBy: [{ postedDay: "desc" }, { createdAt: "desc" }],
      take: 500,
      select: { id: true, url: true, platform: true, postedDay: true, byStaff: true, campaign: { select: { id: true, name: true } } },
    }),
    handle ? prisma.instagramTag.findMany({ where: { brandId: ctx.brand.id, username: { equals: handle, mode: "insensitive" } }, orderBy: { postedAt: "desc" }, take: 500 }) : Promise.resolve([]),
    prisma.instagramPost.findMany({ where: { accountId: me.accountId }, select: { permalink: true, mediaType: true, productType: true, likes: true, comments: true } }),
  ]);
  const igByCode = new Map(igPosts.map((p) => [igShortcode(p.permalink ?? ""), p]).filter(([k]) => k) as [string, (typeof igPosts)[number]][]);

  type Raw = Omit<MyPost, "complete" | "commissionCents" | "orders" | "normalCents" | "aboveCents" | "overlap">;
  const raw: Raw[] = manual.map((p) => {
    const ig = igByCode.get(igShortcode(p.url) ?? "") ?? null;
    return { id: p.id, source: "MANUAL", url: p.url, platform: p.platform as PostPlatform, format: postFormat(p.url, p.platform as PostPlatform, ig), postedDay: p.postedDay, campaign: p.campaign, byStaff: p.byStaff, likes: ig?.likes ?? null, comments: ig?.comments ?? null };
  });
  for (const t of tags) {
    const code = igShortcode(t.permalink);
    const twin = code ? raw.find((r) => igShortcode(r.url) === code) : undefined;
    if (twin) {
      twin.likes = t.likes ?? twin.likes;
      twin.comments = t.comments ?? twin.comments;
      continue;
    }
    const ig = code ? (igByCode.get(code) ?? null) : null;
    raw.push({ id: `ig:${t.id}`, source: "INSTAGRAM", url: t.permalink, platform: "INSTAGRAM", format: postFormat(t.permalink, "INSTAGRAM", ig), postedDay: dayKey(t.postedAt, tz), campaign: null, byStaff: false, likes: t.likes, comments: t.comments });
  }
  raw.sort((a, b) => (a.postedDay < b.postedDay ? 1 : a.postedDay > b.postedDay ? -1 : 0));

  // Comissão e pedidos por dia (janela dos posts, base de 14 dias e as últimas 12 semanas).
  const weeksFrom = addDaysKey(weekStart(today), -7 * WEEKS_BACK);
  const minDay = raw.reduce((m, p) => (postWindow(p.postedDay).baseFrom < m ? postWindow(p.postedDay).baseFrom : m), weeksFrom);
  const orders = await prisma.order.findMany({
    where: { brandId: ctx.brand.id, test: false, cancelledAt: null, financialStatus: { in: [...PAID_FINANCIAL] }, paidAt: { gte: startOfLocalDay(minDay, tz), lt: startOfLocalDay(addDaysKey(today, 1), tz) }, attribution: { creatorId: ctx.creatorId } },
    select: { paidAt: true, ledgerEntries: { where: { creatorId: ctx.creatorId, type: { in: ["COMMISSION", "REVERSAL"] } }, select: { amountCents: true } } },
  });
  const cents = new Map<string, number>();
  const count = new Map<string, number>();
  for (const o of orders) {
    const d = dayKey(o.paidAt!, tz);
    cents.set(d, (cents.get(d) ?? 0) + o.ledgerEntries.reduce((s, e) => s + e.amountCents, 0));
    count.set(d, (count.get(d) ?? 0) + 1);
  }
  const sum = (m: Map<string, number>, from: string, to: string) => {
    let t = 0;
    for (let d = from; d < to; d = addDaysKey(d, 1)) t += m.get(d) ?? 0;
    return t;
  };

  const posts: MyPost[] = raw.map((p, i) => {
    const w = postWindow(p.postedDay);
    const lift = postLift(sum(cents, w.from, w.to), sum(cents, w.baseFrom, w.from));
    const others = raw.filter((_, j) => j !== i).map((q) => q.postedDay);
    return { ...p, complete: today >= w.to, commissionCents: lift.windowCents, orders: sum(count, w.from, w.to), normalCents: lift.normalCents, aboveCents: lift.aboveCents, overlap: overlapsAnother(p.postedDay, others) };
  });

  // Resumo do mês.
  const month = monthKey(now, tz);
  const monthPosts = posts.filter((p) => p.postedDay.slice(0, 7) === month);
  const lastDay = posts[0]?.postedDay ?? null;
  const daysSince = lastDay ? Math.round((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${lastDay}T12:00:00Z`)) / 86_400_000) : null;
  const bestOfMonth = [...monthPosts].sort((a, b) => b.commissionCents - a.commissionCents)[0] ?? null;

  // Semanas: sequência (8) e semana com post x sem post (12 fechadas).
  const streak = weekStreak(posts.map((p) => p.postedDay), today);
  const postWeeks = new Set(posts.map((p) => weekStart(p.postedDay)));
  const closed = Array.from({ length: WEEKS_BACK }, (_, i) => addDaysKey(weekStart(today), -7 * (i + 1))).map((start) => ({ posted: postWeeks.has(start), commissionCents: sum(cents, start, addDaysKey(start, 7)) }));

  // Ideias da semana: campanha da vez em que está inscrita + produtos que mais vendem para ela (90 dias).
  const [lines, running] = await Promise.all([
    prisma.orderLine.groupBy({
      by: ["title"],
      where: { discountedTotalCents: { gt: 0 }, order: { brandId: ctx.brand.id, test: false, cancelledAt: null, financialStatus: { in: [...PAID_FINANCIAL] }, paidAt: { gte: new Date(now.getTime() - 90 * 86_400_000) }, attribution: { creatorId: ctx.creatorId } } },
      _sum: { quantity: true },
      orderBy: { _sum: { quantity: "desc" } },
      take: 3,
    }),
    prisma.campaign.findFirst({ where: { brandId: ctx.brand.id, publishedAt: { not: null }, startsAt: { lte: now }, endsAt: { gt: now }, entries: { some: { creatorId: ctx.creatorId } } }, select: { name: true } }),
  ]);
  const week = Math.floor(Date.parse(`${weekStart(today)}T12:00:00Z`) / (7 * 86_400_000));
  const ideas = postIdeas(lines.map((l) => l.title.replace(/\s+[—-]\s+.*$/, "")), running?.name ?? null, week, `produto da ${ctx.brand.name}`);

  return {
    posts,
    today,
    summary: { monthPosts: monthPosts.length, lastDay, daysSince, bestOfMonth },
    streak,
    compare: postingWeeks(closed),
    insights: postInsights(posts),
    top: posts.filter((p) => p.complete && p.commissionCents > 0).sort((a, b) => b.commissionCents - a.commissionCents).slice(0, 3),
    ideas,
  };
}
