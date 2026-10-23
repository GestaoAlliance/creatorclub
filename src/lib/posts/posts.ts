import type { PrismaClient } from "@/generated/prisma/client";
import { addDaysKey, dayKey, isDayKey, overlapsAnother, PAID_FINANCIAL, parsePostUrl, postLift, postWindow, startOfLocalDay, type PostPlatform } from "@/domain";
import type { Actor } from "@/lib/auth/actor";
import { can } from "@/lib/auth/permissions";
import type { PortalContext } from "@/lib/portal/context";

/**
 * Posts das creators (M4.6, D-POSTS): ela registra no portal ("Meus posts") o link e o dia do post, opcionalmente
 * de uma campanha em que está inscrita; a equipe (Gestão) também registra pela ficha. Cada post mostra as vendas
 * com o cupom dela pagas nos 3 dias a partir do post, comparadas com o normal dos 14 dias antes. Tirar um post
 * registrado por engano: a creator (o dela) ou a Gestão; fica na auditoria.
 */

export class PostError extends Error {}

const MAX_BACK_DAYS = 60;

export type PostInput = { url: string; postedDay: string; campaignId?: string | null };
type Who = { kind: "creator"; ctx: PortalContext; userId: string } | { kind: "staff"; actor: Actor | null };

async function check(prisma: PrismaClient, creator: { id: string; brandId: string; timezone: string }, input: PostInput, now: Date) {
  const link = parsePostUrl(input.url);
  if (!link.ok) throw new PostError(link.error);
  const today = dayKey(now, creator.timezone);
  if (!isDayKey(input.postedDay) || input.postedDay > today) throw new PostError("Informe o dia em que você postou (hoje ou antes).");
  if (input.postedDay < addDaysKey(today, -MAX_BACK_DAYS)) throw new PostError(`Só dá para registrar posts dos últimos ${MAX_BACK_DAYS} dias.`);
  let campaignId: string | null = null;
  if (input.campaignId) {
    const entry = await prisma.campaignEntry.findUnique({ where: { campaignId_creatorId: { campaignId: input.campaignId, creatorId: creator.id } }, select: { brandId: true } });
    if (!entry || entry.brandId !== creator.brandId) throw new PostError("Escolha uma campanha em que ela está inscrita.");
    campaignId = input.campaignId;
  }
  return { url: link.url, platform: link.platform, postedDay: input.postedDay, campaignId };
}

export async function addPost(prisma: PrismaClient, who: Who, creatorId: string, input: PostInput, now = new Date()) {
  const creator = await prisma.creator.findUnique({ where: { id: creatorId }, select: { id: true, brandId: true, brand: { select: { timezone: true } } } });
  if (!creator) throw new PostError("Creator não encontrada.");
  let userId: string;
  if (who.kind === "creator") {
    if (who.ctx.viewAs) throw new PostError("Visualização da equipe: nada é alterado em nome da creator.");
    if (who.ctx.creatorId !== creatorId) throw new PostError("Sem permissão.");
    userId = who.userId;
  } else {
    if (!who.actor || !can(who.actor.grants, "creators.edit", creator.brandId)) throw new PostError("Sem permissão.");
    userId = who.actor.userId;
  }
  const data = await check(prisma, { id: creator.id, brandId: creator.brandId, timezone: creator.brand.timezone }, input, now);
  return prisma.$transaction(async (tx) => {
    const p = await tx.creatorPost.create({ data: { brandId: creator.brandId, creatorId, ...data, createdById: userId, byStaff: who.kind === "staff", createdAt: now }, select: { id: true } });
    await tx.auditLog.create({ data: { brandId: creator.brandId, actorType: "USER", actorId: userId, action: "post.add", entity: "CreatorPost", entityId: p.id, after: { creatorId, url: data.url, postedDay: data.postedDay } } });
    return p;
  });
}

export async function removePost(prisma: PrismaClient, who: Who, postId: string, now = new Date()) {
  const post = await prisma.creatorPost.findUnique({ where: { id: postId }, select: { id: true, brandId: true, creatorId: true, removedAt: true } });
  if (!post || post.removedAt) throw new PostError("Post não encontrado.");
  let userId: string;
  if (who.kind === "creator") {
    if (who.ctx.viewAs) throw new PostError("Visualização da equipe: nada é alterado em nome da creator.");
    if (who.ctx.creatorId !== post.creatorId) throw new PostError("Sem permissão.");
    userId = who.userId;
  } else {
    if (!who.actor || !can(who.actor.grants, "creators.edit", post.brandId)) throw new PostError("Sem permissão.");
    userId = who.actor.userId;
  }
  await prisma.$transaction([
    prisma.creatorPost.update({ where: { id: postId }, data: { removedAt: now, removedById: userId } }),
    prisma.auditLog.create({ data: { brandId: post.brandId, actorType: "USER", actorId: userId, action: "post.remove", entity: "CreatorPost", entityId: postId } }),
  ]);
}

export type PostWithSales = {
  id: string;
  creatorId: string;
  creatorName: string;
  url: string;
  platform: PostPlatform;
  postedDay: string;
  campaign: { id: string; name: string } | null;
  byStaff: boolean;
  /** null: a janela de 3 dias ainda não terminou (os números ainda mudam). */
  complete: boolean;
  windowCents: number;
  normalCents: number;
  aboveCents: number;
  overlap: boolean;
};

/** Posts (não retirados) com as vendas depois de cada um. */
async function withSales(prisma: PrismaClient, brandId: string, where: { creatorId?: string; campaignId?: string; sinceDay?: string }, now: Date): Promise<PostWithSales[]> {
  const brand = await prisma.brand.findUniqueOrThrow({ where: { id: brandId }, select: { timezone: true } });
  const posts = await prisma.creatorPost.findMany({
    where: { brandId, removedAt: null, ...(where.creatorId ? { creatorId: where.creatorId } : {}), ...(where.campaignId ? { campaignId: where.campaignId } : {}), ...(where.sinceDay ? { postedDay: { gte: where.sinceDay } } : {}) },
    orderBy: [{ postedDay: "desc" }, { createdAt: "desc" }],
    take: 500,
    select: { id: true, creatorId: true, url: true, platform: true, postedDay: true, byStaff: true, campaign: { select: { id: true, name: true } }, creator: { select: { account: { select: { name: true } } } } },
  });
  if (!posts.length) return [];
  const creatorIds = [...new Set(posts.map((p) => p.creatorId))];
  const minDay = posts.reduce((m, p) => (postWindow(p.postedDay).baseFrom < m ? postWindow(p.postedDay).baseFrom : m), "9999-12-31");
  const maxDay = posts.reduce((m, p) => (postWindow(p.postedDay).to > m ? postWindow(p.postedDay).to : m), "0000-01-01");
  const orders = await prisma.order.findMany({
    where: { brandId, test: false, cancelledAt: null, financialStatus: { in: [...PAID_FINANCIAL] }, paidAt: { gte: startOfLocalDay(minDay, brand.timezone), lt: startOfLocalDay(maxDay, brand.timezone) }, attribution: { creatorId: { in: creatorIds } } },
    select: { subtotalCents: true, paidAt: true, attribution: { select: { creatorId: true } } },
  });
  const byDay = new Map<string, number>(); // `${creatorId}|${dia}`
  for (const o of orders) {
    const k = `${o.attribution!.creatorId}|${dayKey(o.paidAt!, brand.timezone)}`;
    byDay.set(k, (byDay.get(k) ?? 0) + o.subtotalCents);
  }
  const sum = (creatorId: string, from: string, to: string) => {
    let t = 0;
    for (let d = from; d < to; d = addDaysKey(d, 1)) t += byDay.get(`${creatorId}|${d}`) ?? 0;
    return t;
  };
  const today = dayKey(now, brand.timezone);
  const daysOf = new Map<string, string[]>();
  for (const p of posts) daysOf.set(p.creatorId, [...(daysOf.get(p.creatorId) ?? []), p.postedDay]);
  return posts.map((p, i) => {
    const w = postWindow(p.postedDay);
    const lift = postLift(sum(p.creatorId, w.from, w.to), sum(p.creatorId, w.baseFrom, w.from));
    const others = posts.filter((q, j) => j !== i && q.creatorId === p.creatorId).map((q) => q.postedDay);
    return {
      id: p.id,
      creatorId: p.creatorId,
      creatorName: p.creator.account.name,
      url: p.url,
      platform: p.platform as PostPlatform,
      postedDay: p.postedDay,
      campaign: p.campaign,
      byStaff: p.byStaff,
      complete: today >= w.to,
      ...lift,
      overlap: overlapsAnother(p.postedDay, others),
    };
  });
}

/** "Meus posts" (portal). */
export const myPosts = (prisma: PrismaClient, ctx: PortalContext, now = new Date()) => withSales(prisma, ctx.brand.id, { creatorId: ctx.creatorId }, now);

/** Aba Conteúdo da ficha. */
export async function creatorPosts(prisma: PrismaClient, actor: Actor | null, creatorId: string, now = new Date()) {
  const c = await prisma.creator.findUnique({ where: { id: creatorId }, select: { brandId: true } });
  if (!c || !actor || !can(actor.grants, "creators.view", c.brandId)) throw new PostError("Sem permissão.");
  return withSales(prisma, c.brandId, { creatorId }, now);
}

/** Tela geral de posts da marca (últimos 60 dias). */
export async function brandPosts(prisma: PrismaClient, actor: Actor | null, brandId: string, now = new Date()) {
  if (!actor || !can(actor.grants, "creators.view", brandId)) throw new PostError("Sem permissão.");
  const brand = await prisma.brand.findUniqueOrThrow({ where: { id: brandId }, select: { timezone: true } });
  return withSales(prisma, brandId, { sinceDay: addDaysKey(dayKey(now, brand.timezone), -MAX_BACK_DAYS) }, now);
}

/** Posts de uma campanha (equipe). */
export async function campaignPosts(prisma: PrismaClient, brandId: string, campaignId: string, now = new Date()) {
  return withSales(prisma, brandId, { campaignId }, now);
}

/** Campanhas abertas em que ela está inscrita (para ligar o post). */
export async function postCampaignOptions(prisma: PrismaClient, creatorId: string, now = new Date()) {
  const entries = await prisma.campaignEntry.findMany({
    where: { creatorId, campaign: { publishedAt: { not: null }, settledAt: null, endsAt: { gt: new Date(now.getTime() - 7 * 86_400_000) } } },
    select: { campaign: { select: { id: true, name: true } } },
  });
  return entries.map((e) => e.campaign);
}

/** Último post registrado de cada creator (fila de ações). */
export async function lastPostDays(prisma: PrismaClient, creatorIds: readonly string[]) {
  if (!creatorIds.length) return new Map<string, string>();
  const rows = await prisma.creatorPost.groupBy({ by: ["creatorId"], where: { creatorId: { in: [...creatorIds] }, removedAt: null }, _max: { postedDay: true } });
  return new Map(rows.map((r) => [r.creatorId, r._max.postedDay!]));
}
