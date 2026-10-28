import type { PrismaClient } from "@/generated/prisma/client";
import {
  bestFormat,
  captionHasCoupon,
  engagementBps,
  engagementDrop,
  followerGrowth,
  lastPostAt,
  postsPerWeekX100,
  salesPerThousandFollowers,
  usableHandle,
  type IgFormat,
  type IgMediaType,
  type IgPost,
} from "@/domain";
import type { Actor } from "@/lib/auth/actor";
import { can } from "@/lib/auth/permissions";

/**
 * Instagram das creators ativas da marca (D-INSTAGRAM), a partir das leituras diárias: só a equipe vê
 * (`performance.view`). Vendas do mês vêm de fora (o Desempenho já calcula) para a venda por mil seguidores.
 */

export class InstagramError extends Error {}

const DAY = 86_400_000;
const RECENT_POST_DAYS = 120;

export type InstagramRow = {
  creatorId: string;
  name: string;
  handle: string | null;
  /** NO_HANDLE = sem @ no cadastro; PENDING = ainda não lido; UNREADABLE = perfil pessoal, privado ou @ errado. */
  status: "OK" | "UNREADABLE" | "PENDING" | "NO_HANDLE";
  readAt: string | null;
  followers: number | null;
  growth: number | null;
  engagementBps: number | null;
  postsPerWeekX100: number | null;
  lastPostAt: Date | null;
  best: { format: IgFormat; bps: number } | null;
  drop: { dropBps: number; alert: boolean } | null;
  couponPosts: number;
  salesPer1kCents: number | null;
};

export async function instagramRanking(prisma: PrismaClient, actor: Actor | null, brandId: string, salesByCreator: ReadonlyMap<string, number>, now = new Date()) {
  if (!actor || !can(actor.grants, "performance.view", brandId)) throw new InstagramError("Sem permissão.");
  return buildRanking(prisma, brandId, salesByCreator, now);
}

/** Resumo semanal (D-WEEKLY): quantas creators ativas tiveram queda de engajamento de 40% ou mais. */
export async function engagementDropCount(prisma: PrismaClient, brandId: string, now = new Date()): Promise<number> {
  const { rows } = await buildRanking(prisma, brandId, new Map(), now);
  return rows.filter((r) => r.drop?.alert).length;
}

async function buildRanking(prisma: PrismaClient, brandId: string, salesByCreator: ReadonlyMap<string, number>, now: Date) {
  const brand = await prisma.brand.findUniqueOrThrow({ where: { id: brandId }, select: { instagramUserId: true } });
  const creators = await prisma.creator.findMany({
    where: { brandId, status: "ACTIVE", archivedAt: null },
    select: {
      id: true,
      accountId: true,
      account: { select: { name: true, instagram: true } },
      couponAssignments: { where: { validTo: null }, select: { coupon: { select: { code: true } } } },
    },
  });
  const accountIds = [...new Set(creators.map((c) => c.accountId))];
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const [snaps, monthSnaps, posts, tags] = await Promise.all([
    prisma.instagramSnapshot.findMany({ where: { accountId: { in: accountIds } }, orderBy: { day: "desc" }, distinct: ["accountId"], select: { accountId: true, day: true, status: true, followers: true } }),
    prisma.instagramSnapshot.findMany({ where: { accountId: { in: accountIds }, day: { gte: monthStart }, status: "OK" }, select: { accountId: true, day: true, followers: true } }),
    prisma.instagramPost.findMany({
      where: { accountId: { in: accountIds }, postedAt: { gte: new Date(now.getTime() - RECENT_POST_DAYS * DAY) } },
      select: { id: true, accountId: true, postedAt: true, mediaType: true, productType: true, likes: true, comments: true, caption: true, permalink: true },
    }),
    prisma.instagramTag.findMany({ where: { brandId }, orderBy: { postedAt: "desc" }, take: 30, select: { username: true, postedAt: true, permalink: true, likes: true, comments: true } }),
  ]);
  const lastSnap = new Map(snaps.map((s) => [s.accountId, s]));
  const rows: InstagramRow[] = creators.map((c) => {
    const handle = usableHandle(c.account.instagram)?.toLowerCase() ?? null;
    const snap = lastSnap.get(c.accountId);
    const base = { creatorId: c.id, name: c.account.name, handle, readAt: snap ? snap.day.toISOString().slice(0, 10) : null };
    const empty = { followers: null, growth: null, engagementBps: null, postsPerWeekX100: null, lastPostAt: null, best: null, drop: null, couponPosts: 0, salesPer1kCents: null };
    if (!handle) return { ...base, ...empty, status: "NO_HANDLE" };
    if (!snap) return { ...base, ...empty, status: "PENDING" };
    if (snap.status !== "OK" || snap.followers === null) return { ...base, ...empty, status: "UNREADABLE" };
    const followers = snap.followers;
    const mine: IgPost[] = posts
      .filter((p) => p.accountId === c.accountId)
      .map((p) => ({ id: p.id, at: p.postedAt, type: p.mediaType as IgMediaType, productType: p.productType, likes: p.likes ?? 0, comments: p.comments ?? 0, caption: p.caption, permalink: p.permalink }));
    const last30 = mine.filter((p) => p.at.getTime() >= now.getTime() - 30 * DAY);
    const codes = c.couponAssignments.map((a) => a.coupon.code);
    return {
      ...base,
      status: "OK",
      followers,
      growth: followerGrowth(monthSnaps.filter((s) => s.accountId === c.accountId).map((s) => ({ day: s.day.toISOString().slice(0, 10), followers: s.followers ?? 0 })))?.delta ?? null,
      engagementBps: engagementBps(last30.length ? last30 : mine.slice(0, 12), followers),
      postsPerWeekX100: postsPerWeekX100(mine, now),
      lastPostAt: lastPostAt(mine),
      best: bestFormat(mine, followers),
      drop: engagementDrop(mine, followers, now),
      couponPosts: last30.filter((p) => codes.some((code) => captionHasCoupon(p.caption, code))).length,
      salesPer1kCents: salesPerThousandFollowers(salesByCreator.get(c.id) ?? 0, followers),
    };
  });
  const byHandle = new Map(rows.filter((r) => r.handle).map((r) => [r.handle!, r]));
  return {
    connected: brand.instagramUserId !== null,
    rows,
    tags: tags.map((t) => ({ ...t, creator: byHandle.get(t.username) ? { id: byHandle.get(t.username)!.creatorId, name: byHandle.get(t.username)!.name } : null })),
  };
}

/** Quadro "Instagram" da ficha: últimas leituras e os posts recentes, com a marca de cupom na legenda. */
export async function creatorInstagram(prisma: PrismaClient, actor: Actor | null, creatorId: string, now = new Date()) {
  const c = await prisma.creator.findUnique({
    where: { id: creatorId },
    select: { brandId: true, accountId: true, account: { select: { instagram: true } }, couponAssignments: { where: { validTo: null }, select: { coupon: { select: { code: true } } } } },
  });
  if (!c || !actor || !can(actor.grants, "performance.view", c.brandId)) return null;
  const [snaps, posts] = await Promise.all([
    prisma.instagramSnapshot.findMany({ where: { accountId: c.accountId }, orderBy: { day: "desc" }, take: 90, select: { day: true, status: true, followers: true } }),
    prisma.instagramPost.findMany({ where: { accountId: c.accountId }, orderBy: { postedAt: "desc" }, take: 30, select: { id: true, postedAt: true, mediaType: true, productType: true, likes: true, comments: true, caption: true, permalink: true } }),
  ]);
  const last = snaps[0] ?? null;
  const followers = last?.status === "OK" ? last.followers : null;
  const codes = c.couponAssignments.map((a) => a.coupon.code);
  const ig: IgPost[] = posts.map((p) => ({ id: p.id, at: p.postedAt, type: p.mediaType as IgMediaType, productType: p.productType, likes: p.likes ?? 0, comments: p.comments ?? 0, caption: p.caption, permalink: p.permalink }));
  return {
    handle: usableHandle(c.account.instagram)?.toLowerCase() ?? null,
    status: last ? last.status : null,
    readAt: last ? last.day.toISOString().slice(0, 10) : null,
    followers,
    history: snaps.filter((s) => s.status === "OK" && s.followers !== null).map((s) => ({ day: s.day.toISOString().slice(0, 10), followers: s.followers! })).reverse(),
    engagementBps: followers ? engagementBps(ig.slice(0, 12), followers) : null,
    postsPerWeekX100: postsPerWeekX100(ig, now),
    best: followers ? bestFormat(ig, followers) : null,
    drop: followers ? engagementDrop(ig, followers, now) : null,
    posts: posts.slice(0, 9).map((p) => ({ ...p, hasCoupon: codes.some((code) => captionHasCoupon(p.caption, code)) })),
  };
}
