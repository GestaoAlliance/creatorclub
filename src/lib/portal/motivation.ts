import type { PrismaClient } from "@/generated/prisma/client";
import { achievements, bestFormat, dailyTip, dayKey, monthKey, rankBand, type IgMediaType, type IgPost } from "@/domain";
import { productImages } from "@/lib/reports/product-images";
import { kitProducts, kitProgress } from "@/lib/shipments/kits";
import type { PortalContext } from "./context";

/**
 * Início do portal (D-PORTALHOME): o que anima a creator a vender e o que falta fazer. Conquistas, faixa de posição no
 * mês (sem nome nem valor das outras), dica do dia com os dados dela, próximo kit com foto e próximos passos. Só da
 * própria creator e da marca do portal.
 */

const DAY = 86_400_000;
const PAID = ["PAID", "PARTIALLY_REFUNDED"] as const;

export type NextStep = { id: "kit" | "tiktok" | "birthday" | "mother" | "post"; label: string; href: string; done: boolean };

export async function portalHomeExtras(prisma: PrismaClient, ctx: PortalContext, now = new Date()) {
  const brand = await prisma.brand.findUniqueOrThrow({ where: { id: ctx.brand.id }, select: { timezone: true } });
  const tz = brand.timezone;
  const month = monthKey(now, tz);
  const base = `/portal/${ctx.brand.slug}`;
  const paidWhere = { financialStatus: { in: [...PAID] }, cancelledAt: null, test: false, paidAt: { not: null } };
  const [mine, releases, monthAll, me, kitPending, posts, kit, kitProds, imageOf] = await Promise.all([
    prisma.orderAttribution.findMany({ where: { creatorId: ctx.creatorId, brandId: ctx.brand.id, order: paidWhere }, select: { order: { select: { paidAt: true, subtotalCents: true } } } }),
    prisma.commissionRelease.count({ where: { creatorId: ctx.creatorId } }),
    // Vendas do mês de cada creator ativa da marca (só para a faixa; nada disso sai da função).
    prisma.orderAttribution.findMany({
      where: { brandId: ctx.brand.id, creator: { status: "ACTIVE" }, order: { ...paidWhere, paidAt: { gte: new Date(now.getTime() - 32 * DAY) } } },
      select: { creatorId: true, order: { select: { paidAt: true, subtotalCents: true } } },
    }),
    prisma.creator.findUniqueOrThrow({
      where: { id: ctx.creatorId },
      select: { receivesAsIndividual: true, accountId: true, account: { select: { tiktok: true, birthDate: true, motherName: true } } },
    }),
    prisma.kitGrant.count({ where: { creatorId: ctx.creatorId, brandId: ctx.brand.id, status: "PENDING" } }),
    prisma.creatorPost.findFirst({ where: { creatorId: ctx.creatorId }, orderBy: { postedDay: "desc" }, select: { postedDay: true } }),
    ctx.ugcOnly ? Promise.resolve(null) : kitProgress(prisma, ctx, now),
    ctx.ugcOnly ? Promise.resolve([]) : kitProducts(prisma, ctx.brand.id),
    productImages(prisma, ctx.brand.id),
  ]);
  const [snap, igPosts, activeIds] = await Promise.all([
    prisma.instagramSnapshot.findFirst({ where: { accountId: me.accountId }, orderBy: { day: "desc" }, select: { status: true, followers: true } }),
    prisma.instagramPost.findMany({ where: { accountId: me.accountId }, orderBy: { postedAt: "desc" }, take: 30, select: { id: true, postedAt: true, mediaType: true, productType: true, likes: true, comments: true, caption: true, permalink: true } }),
    prisma.creator.findMany({ where: { brandId: ctx.brand.id, status: "ACTIVE" }, select: { id: true } }),
  ]);

  // Conquistas.
  const salesMonths = mine.map((a) => monthKey(a.order.paidAt!, tz));
  const badges = achievements({ paidOrders: mine.length, releases, salesMonths });

  // Faixa no mês (quem não vendeu conta zero).
  const byCreator = new Map(activeIds.map((c) => [c.id, 0]));
  for (const a of monthAll) if (a.order.paidAt && monthKey(a.order.paidAt, tz) === month && byCreator.has(a.creatorId)) byCreator.set(a.creatorId, byCreator.get(a.creatorId)! + Math.max(0, a.order.subtotalCents));
  const band = ctx.ugcOnly ? null : rankBand(byCreator.get(ctx.creatorId) ?? 0, [...byCreator.values()]);

  // Dica do dia.
  const followers = snap?.status === "OK" ? snap.followers : null;
  const ig: IgPost[] = igPosts.map((p) => ({ id: p.id, at: p.postedAt, type: p.mediaType as IgMediaType, productType: p.productType, likes: p.likes ?? 0, comments: p.comments ?? 0, caption: p.caption, permalink: p.permalink }));
  const recent = mine.filter((a) => a.order.paidAt!.getTime() >= now.getTime() - 90 * DAY);
  let bestWeekday: number | null = null;
  if (recent.length >= 5) {
    const counts = Array<number>(7).fill(0);
    for (const a of recent) counts[new Date(`${dayKey(a.order.paidAt!, tz)}T12:00:00Z`).getUTCDay()]!++;
    bestWeekday = counts.indexOf(Math.max(...counts));
  }
  const lastPost = [igPosts[0]?.postedAt.getTime() ?? null, posts ? Date.parse(`${posts.postedDay}T12:00:00Z`) : null].filter((x): x is number => x !== null);
  const daysSincePost = lastPost.length ? Math.floor((now.getTime() - Math.max(...lastPost)) / DAY) : null;
  const dayOfYear = Math.floor((Date.parse(`${dayKey(now, tz)}T12:00:00Z`) - Date.UTC(now.getUTCFullYear(), 0, 1)) / DAY);
  const tip = dailyTip({ bestFormat: followers ? (bestFormat(ig, followers)?.format ?? null) : null, bestWeekday, daysSincePost, dayOfYear });

  // Próximos passos (somem quando a lista está completa).
  const steps: NextStep[] = [
    ...(kitPending ? [{ id: "kit" as const, label: "Escolher os produtos do seu kit", href: `${base}/envios`, done: false }] : []),
    { id: "tiktok", label: "Informar o seu TikTok", href: "#pergunta-tiktok", done: Boolean(me.account.tiktok) },
    { id: "birthday", label: "Contar o seu aniversário", href: "#pergunta-aniversario", done: Boolean(me.account.birthDate) },
    ...(me.receivesAsIndividual ? [{ id: "mother" as const, label: "Informar o nome da sua mãe (cartão Alelo)", href: "#pergunta-mae", done: Boolean(me.account.motherName) }] : []),
    { id: "post", label: "Registrar o seu primeiro post", href: `${base}/posts`, done: Boolean(posts) || igPosts.length > 0 },
  ];

  return {
    achievements: badges,
    band,
    tip,
    steps: steps.every((s) => s.done) ? [] : steps,
    kit,
    kitPhotos: kitProds.slice(0, 4).map((p) => ({ title: p.title, image: imageOf(p.title) ?? p.photo ?? null })),
  };
}
