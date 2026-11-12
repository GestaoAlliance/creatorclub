import type { PrismaClient } from "@/generated/prisma/client";
import { addDaysKey, dayKey } from "@/domain";
import { productImages } from "@/lib/reports/product-images";
import type { PortalContext } from "./context";
import { resolvePeriod } from "./period";

/**
 * Extras da tela Vendas do portal (D-PORTALSALES, pedido do responsável em 2026-11-12), do período escolhido e só dos
 * pedidos dela: período anterior do mesmo tamanho (dia a dia, para o gráfico), produtos de cada pedido e os que mais
 * vende (com foto; brinde de R$ 0 fica fora), melhor dia da semana e horário, clientes novas (sem nomes) e os dias em
 * que postou. Nenhum dado de cliente sai daqui.
 */

const PAID = ["PAID", "PARTIALLY_REFUNDED"] as const;
const WEEKDAY = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

export async function portalSalesExtras(prisma: PrismaClient, ctx: PortalContext, input: { p?: string; de?: string; ate?: string } = {}, now = new Date()) {
  const { timezone: tz } = await prisma.brand.findUniqueOrThrow({ where: { id: ctx.brand.id }, select: { timezone: true } });
  const period = resolvePeriod(input, now, tz);
  const len = period.days.length;
  const prevFirst = addDaysKey(period.firstDay, -len);
  const span = period.to.getTime() - period.from.getTime();
  const paid = { financialStatus: { in: [...PAID] }, cancelledAt: null, test: false };
  const [orders, prev, account, posts, imageOf] = await Promise.all([
    prisma.order.findMany({
      where: { ...paid, brandId: ctx.brand.id, attribution: { creatorId: ctx.creatorId }, paidAt: { gte: period.from, lt: period.to } },
      select: { id: true, paidAt: true, createdAtShop: true, customerShopifyId: true, lines: { where: { discountedTotalCents: { gt: 0 } }, select: { title: true, quantity: true } } },
    }),
    prisma.order.findMany({
      where: { ...paid, brandId: ctx.brand.id, attribution: { creatorId: ctx.creatorId }, paidAt: { gte: new Date(period.from.getTime() - span), lt: period.from } },
      select: { paidAt: true, subtotalCents: true, ledgerEntries: { where: { creatorId: ctx.creatorId, type: { in: ["COMMISSION", "REVERSAL"] } }, select: { amountCents: true } } },
    }),
    prisma.creator.findUniqueOrThrow({ where: { id: ctx.creatorId }, select: { accountId: true } }),
    prisma.creatorPost.findMany({ where: { creatorId: ctx.creatorId, removedAt: null, postedDay: { gte: period.firstDay, lte: period.lastDay } }, select: { postedDay: true } }),
    productImages(prisma, ctx.brand.id),
  ]);
  const igPosts = await prisma.instagramPost.findMany({ where: { accountId: account.accountId, postedAt: { gte: period.from, lt: period.to } }, select: { postedAt: true } });

  // Período anterior, dia a dia na mesma posição.
  const previous = Array<number>(len).fill(0);
  // D-PORTALSALES: o portal compara a comissão (o total de vendas não aparece na faixa).
  const previousCommission = Array<number>(len).fill(0);
  for (const o of prev) {
    const i = period.days.length ? daysBetween(prevFirst, dayKey(o.paidAt!, tz)) : -1;
    if (i >= 0 && i < len) {
      previous[i]! += Math.max(0, o.subtotalCents);
      previousCommission[i]! += o.ledgerEntries.reduce((s, e) => s + e.amountCents, 0);
    }
  }

  // Produtos de cada pedido e os que mais vende.
  const items: Record<string, { title: string; quantity: number; image: string | null }[]> = {};
  const units = new Map<string, number>();
  for (const o of orders) {
    items[o.id] = o.lines.map((l) => ({ title: l.title, quantity: l.quantity, image: imageOf(l.title) }));
    for (const l of o.lines) units.set(l.title, (units.get(l.title) ?? 0) + l.quantity);
  }
  const top = [...units].map(([title, qty]) => ({ title, units: qty, image: imageOf(title) })).sort((a, b) => b.units - a.units || a.title.localeCompare(b.title, "pt-BR")).slice(0, 5);

  // Melhor dia e horário (pelo pagamento, no fuso da marca); só com 3+ pedidos.
  let best: { weekday: string; hours: string } | null = null;
  if (orders.length >= 3) {
    const wd = Array<number>(7).fill(0);
    const hr = Array<number>(24).fill(0);
    for (const o of orders) {
      const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", hour: "numeric", hourCycle: "h23" }).formatToParts(o.paidAt!);
      const w = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.find((p) => p.type === "weekday")!.value);
      const h = Number(parts.find((p) => p.type === "hour")!.value) % 24;
      wd[w]!++;
      hr[h]!++;
    }
    // Janela de 3 horas com mais pedidos.
    let bh = 0;
    let bc = -1;
    for (let h = 0; h < 24; h++) {
      const c = hr[h]! + hr[(h + 1) % 24]! + hr[(h + 2) % 24]!;
      if (c > bc) [bh, bc] = [h, c];
    }
    const w = wd.indexOf(Math.max(...wd));
    best = { weekday: `${WEEKDAY[w]}${w === 0 || w === 6 ? "" : "-feira"}`, hours: `das ${bh}h às ${(bh + 3) % 24}h` };
  }

  // Clientes novas: a compra é a 1ª da cliente na loja (sem o id da cliente, "sem dado").
  const ids = [...new Set(orders.map((o) => o.customerShopifyId).filter((x): x is string => Boolean(x)))];
  const firsts = ids.length
    ? await prisma.order.groupBy({ by: ["customerShopifyId"], where: { brandId: ctx.brand.id, customerShopifyId: { in: ids }, test: false }, _min: { createdAtShop: true } })
    : [];
  const first = new Map(firsts.map((f) => [f.customerShopifyId!, f._min.createdAtShop!.getTime()]));
  const customers = { new: 0, returning: 0, unknown: 0 };
  for (const o of orders) {
    if (!o.customerShopifyId) customers.unknown++;
    else if (first.get(o.customerShopifyId) === o.createdAtShop.getTime()) customers.new++;
    else customers.returning++;
  }

  const postDays = [...new Set([...posts.map((p) => p.postedDay), ...igPosts.map((p) => dayKey(p.postedAt, tz))])].filter((d) => d >= period.firstDay && d <= period.lastDay).sort();
  return { previous, previousCommission, items, top, best, customers, postDays };
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);
}
