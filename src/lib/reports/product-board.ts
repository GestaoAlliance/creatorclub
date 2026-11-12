import type { PrismaClient } from "@/generated/prisma/client";
import { addDaysKey, dayKey, nextDayKey, PAID_FINANCIAL, startOfLocalDay, trendOf } from "@/domain";
import type { DashPeriod } from "@/lib/staff/dashboard";
import { productImages } from "./product-images";
import { productReport, productResolver, type ProductScope } from "./products";

/**
 * Tela Produtos (D-PRODUCTBOARD, pedido do responsável em 2026-11-12): o relatório de produtos (D-COST) com a tendência
 * contra o período anterior do mesmo tamanho, o estoque do Olist e quanto ele dura no ritmo do período, os produtos
 * ativos que não venderam e o painel de cada produto (creators que mais vendem, semanas, preço, custo e estoque).
 * "Acabando" = estoque para 15 dias ou menos no ritmo de vendas do período (só produtos que venderam).
 */

const DAY = 86_400_000;
export const STOCK_WARN_DAYS = 15;

/** Período anterior do mesmo tamanho, logo antes. */
export function previousPeriod(p: { from: string; to: string }): { from: string; to: string; preset: string } {
  const days = Math.round((Date.parse(`${p.to}T00:00:00Z`) - Date.parse(`${p.from}T00:00:00Z`)) / DAY) + 1;
  return { from: addDaysKey(p.from, -days), to: addDaysKey(p.from, -1), preset: "" };
}

export async function productBoard(prisma: PrismaClient, brandId: string, period: DashPeriod, scope: ProductScope) {
  const prev = previousPeriod(period);
  const [r, before, products] = await Promise.all([
    productReport(prisma, brandId, period, scope),
    productReport(prisma, brandId, prev, scope),
    prisma.product.findMany({ where: { brandId }, select: { id: true, title: true, active: true, stockQty: true, stockSyncedAt: true, priceCents: true, costCents: true, imageUrl: true, shopifyId: true } }),
  ]);
  const days = Math.round((Date.parse(`${period.to}T00:00:00Z`) - Date.parse(`${period.from}T00:00:00Z`)) / DAY) + 1;
  const prevBy = new Map(before.rows.map((x) => [x.key, x]));
  const byId = new Map(products.map((p) => [p.id, p]));
  // Brinde (linha sem valor) fica fora do ranking (como no Início); o custo dele continua no lucro do programa.
  const gifts = r.rows.filter((x) => x.revenueCents <= 0).reduce((n, x) => n + x.units, 0);
  const rows = r.rows.filter((x) => x.revenueCents > 0).map((x) => {
    const p = byId.get(x.key) ?? null;
    const was = prevBy.get(x.key);
    const perDay = x.units / days;
    const stock = p?.stockQty ?? null;
    const coverDays = stock !== null && perDay > 0 ? Math.floor(stock / perDay) : null;
    return {
      ...x,
      productId: p?.id ?? null,
      prevUnits: was?.units ?? 0,
      prevRevenueCents: was?.revenueCents ?? 0,
      trend: trendOf(x.units, was?.units ?? 0),
      priceCents: p?.priceCents ?? null,
      stockQty: stock,
      coverDays,
      lowStock: coverDays !== null && coverDays <= STOCK_WARN_DAYS,
    };
  });
  const sold = new Set(rows.map((x) => x.productId).filter(Boolean));
  const imageOf = await productImages(prisma, brandId);
  const idle = products
    .filter((p) => p.active && !sold.has(p.id) && !/^kit|combo/i.test(p.title.trim()))
    .map((p) => ({ id: p.id, title: p.title, image: p.imageUrl ?? imageOf(p.title), stockQty: p.stockQty }))
    .sort((a, b) => a.title.localeCompare(b.title, "pt-BR"));
  const rising = rows.filter((x) => x.trend.dir === "up" || x.trend.dir === "new").sort((a, b) => b.units - b.prevUnits - (a.units - a.prevUnits)).slice(0, 3);
  const falling = [...before.rows.filter((x) => x.revenueCents > 0)]
    .map((b) => ({ ...b, now: rows.find((x) => x.key === b.key)?.units ?? 0 }))
    .filter((b) => b.units >= 3 && b.now < b.units * 0.9)
    .sort((a, b) => b.units - b.now - (a.units - a.now))
    .slice(0, 3);
  return { report: r, gifts, previous: { period: prev, revenueCents: before.totals.revenueCents, units: before.totals.units }, rows, idle, rising, falling, days };
}

/** D-PRODUCTBOARD: o painel de um produto no período (creators que mais vendem, unidades por semana, preço, custo e estoque). */
export async function productDetail(prisma: PrismaClient, brandId: string, key: string, period: DashPeriod, scope: ProductScope) {
  const brand = await prisma.brand.findUniqueOrThrow({ where: { id: brandId }, select: { timezone: true } });
  const tz = brand.timezone;
  const products = await prisma.product.findMany({ where: { brandId }, select: { id: true, shopifyId: true, title: true, costCents: true, priceCents: true, stockQty: true, stockSyncedAt: true, imageUrl: true, active: true } });
  const product = products.find((p) => p.id === key) ?? null;
  const title = product?.title ?? (key.startsWith("t:") ? key.slice(2) : null);
  if (!title) return null;
  const resolve = productResolver(products);
  const lt = startOfLocalDay(nextDayKey(period.to), tz);
  const since12w = new Date(lt.getTime() - 12 * 7 * DAY);
  const gte = startOfLocalDay(period.from, tz);
  const lines = await prisma.orderLine.findMany({
    where: {
      brandId,
      discountedTotalCents: { gt: 0 },
      order: { cancelledAt: null, test: false, financialStatus: { in: [...PAID_FINANCIAL] }, paidAt: { gte: since12w < gte ? since12w : gte, lt }, ...(scope === "creators" ? { attribution: { isNot: null } } : {}) },
    },
    select: { title: true, productShopifyId: true, quantity: true, discountedTotalCents: true, order: { select: { paidAt: true, attribution: { select: { creatorId: true, creator: { select: { account: { select: { name: true } } } } } } } } },
  });
  const mine = lines.filter((l) => {
    const p = resolve(l);
    return product ? p?.id === product.id : !p && l.title.trim().toLowerCase() === title.trim().toLowerCase();
  });
  const weeks = Array<number>(12).fill(0);
  const creators = new Map<string, { name: string; units: number; cents: number }>();
  let units = 0;
  let cents = 0;
  for (const l of mine) {
    const at = l.order.paidAt!;
    const ago = Math.floor((lt.getTime() - at.getTime()) / (7 * DAY));
    if (ago >= 0 && ago < 12) weeks[11 - ago]! += l.quantity;
    if (at < gte) continue;
    units += l.quantity;
    cents += l.discountedTotalCents;
    const a = l.order.attribution;
    if (!a) continue;
    const c = creators.get(a.creatorId) ?? { name: a.creator.account.name, units: 0, cents: 0 };
    c.units += l.quantity;
    c.cents += l.discountedTotalCents;
    creators.set(a.creatorId, c);
  }
  const imageOf = await productImages(prisma, brandId);
  return {
    key,
    title,
    image: product?.imageUrl ?? imageOf(title),
    active: product?.active ?? null,
    priceCents: product?.priceCents ?? null,
    costCents: product?.costCents ?? null,
    stockQty: product?.stockQty ?? null,
    stockDay: product?.stockSyncedAt ? dayKey(product.stockSyncedAt, tz) : null,
    units,
    cents,
    weeks,
    creators: [...creators].map(([id, c]) => ({ id, ...c })).sort((a, b) => b.units - a.units).slice(0, 8),
  };
}
