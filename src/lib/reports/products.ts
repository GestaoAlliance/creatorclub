import type { PrismaClient } from "@/generated/prisma/client";
import { nextDayKey, PAID_FINANCIAL, startOfLocalDay } from "@/domain";
import type { DashPeriod } from "@/lib/staff/dashboard";

/**
 * Produtos e custo (M3.2, D-COST). Por produto: receita (valor da linha já com desconto), pedidos, unidades, custo
 * (custo unitário da Shopify × unidades) e margem. E o lucro do programa de creators no período: receita com cupom de
 * creator − custo dos produtos vendidos − comissão − kits enviados (custo dos produtos) − frete dos envios. O desconto
 * do cupom não entra como custo (a receita já é o valor pago). Venda conta pela data do pagamento (D-MONTH), só paga,
 * não cancelada, não teste. Produto sem custo na Shopify entra sem custo e é contado à parte. Só leitura.
 */

export type ProductScope = "creators" | "loja";

export type ProductRow = {
  key: string;
  title: string;
  units: number;
  orders: number;
  revenueCents: number;
  unitCostCents: number | null;
  costCents: number | null;
  marginCents: number | null;
};

const norm = (s: string) => s.trim().toLowerCase();

type CostProduct = { id: string; shopifyId: string; title: string; costCents: number | null };

/** Produto de cada linha do pedido: pelo id da Shopify; linhas antigas (sem id) pelo nome. */
export function productResolver(products: readonly CostProduct[]) {
  const byShopify = new Map(products.map((p) => [p.shopifyId, p]));
  const byTitle = new Map(products.map((p) => [norm(p.title), p]));
  return (l: { productShopifyId: string | null; title: string }) => (l.productShopifyId && byShopify.get(l.productShopifyId)) || byTitle.get(norm(l.title)) || null;
}

export async function productReport(prisma: PrismaClient, brandId: string, period: DashPeriod, scope: ProductScope = "creators") {
  const { timezone: tz } = await prisma.brand.findUniqueOrThrow({ where: { id: brandId }, select: { timezone: true } });
  const gte = startOfLocalDay(period.from, tz);
  const lt = startOfLocalDay(nextDayKey(period.to), tz);
  const orders = await prisma.order.findMany({
    where: {
      brandId,
      cancelledAt: null,
      test: false,
      financialStatus: { in: [...PAID_FINANCIAL] },
      paidAt: { gte, lt },
      ...(scope === "creators" ? { attribution: { isNot: null } } : {}),
    },
    select: { id: true, subtotalCents: true },
  });
  const ids = orders.map((o) => o.id);
  const [lines, products, ledger, shipments] = await Promise.all([
    ids.length
      ? prisma.orderLine.findMany({ where: { brandId, orderId: { in: ids } }, select: { orderId: true, title: true, quantity: true, discountedTotalCents: true, productShopifyId: true } })
      : [],
    prisma.product.findMany({ where: { brandId }, select: { id: true, shopifyId: true, title: true, costCents: true } }),
    ids.length && scope === "creators"
      ? prisma.ledgerEntry.aggregate({ where: { brandId, orderId: { in: ids }, type: { in: ["COMMISSION", "REVERSAL"] } }, _sum: { amountCents: true } })
      : null,
    scope === "creators"
      ? prisma.shipment.findMany({
          where: { brandId, shippedAt: { gte, lt }, status: { in: ["SHIPPED", "DELIVERED"] } },
          select: { freightCents: true, items: { select: { quantity: true, product: { select: { costCents: true } } } } },
        })
      : [],
  ]);

  const productOf = productResolver(products);
  const rows = new Map<string, ProductRow & { orderIds: Set<string> }>();
  let unitsWithoutCost = 0;
  for (const l of lines) {
    const product = productOf(l);
    const key = product?.id ?? `t:${norm(l.title)}`;
    const row = rows.get(key) ?? {
      key,
      title: product?.title ?? l.title,
      units: 0,
      orders: 0,
      revenueCents: 0,
      unitCostCents: product?.costCents ?? null,
      costCents: null,
      marginCents: null,
      orderIds: new Set<string>(),
    };
    row.units += l.quantity;
    row.revenueCents += l.discountedTotalCents;
    row.orderIds.add(l.orderId);
    if (row.unitCostCents === null) unitsWithoutCost += l.quantity;
    rows.set(key, row);
  }
  const list: ProductRow[] = [...rows.values()]
    .map(({ orderIds, ...r }) => {
      const costCents = r.unitCostCents === null ? null : r.unitCostCents * r.units;
      return { ...r, orders: orderIds.size, costCents, marginCents: costCents === null ? null : r.revenueCents - costCents };
    })
    .filter((r) => r.units > 0 || r.revenueCents !== 0)
    .sort((a, b) => b.revenueCents - a.revenueCents || b.units - a.units);

  const revenueCents = orders.reduce((s, o) => s + o.subtotalCents, 0);
  const cogsCents = list.reduce((s, r) => s + (r.costCents ?? 0), 0);
  let kitsCents = 0;
  let kitUnitsWithoutCost = 0;
  let freightCents = 0;
  let shipmentsWithoutFreight = 0;
  for (const s of shipments) {
    if (s.freightCents === null) shipmentsWithoutFreight++;
    else freightCents += s.freightCents;
    for (const i of s.items) {
      if (i.product.costCents === null) kitUnitsWithoutCost += i.quantity;
      else kitsCents += i.product.costCents * i.quantity;
    }
  }
  const commissionCents = ledger?._sum.amountCents ?? 0;
  return {
    period,
    scope,
    rows: list,
    totals: { orders: orders.length, units: list.reduce((s, r) => s + r.units, 0), revenueCents, cogsCents, unitsWithoutCost },
    /** Só para o programa de creators (escopo "creators"). */
    program:
      scope === "creators"
        ? {
            revenueCents,
            cogsCents,
            commissionCents,
            kitsCents,
            freightCents,
            profitCents: revenueCents - cogsCents - commissionCents - kitsCents - freightCents,
            shipments: shipments.length,
            shipmentsWithoutFreight,
            kitUnitsWithoutCost,
          }
        : null,
    productsWithCost: products.filter((p) => p.costCents !== null).length,
    productsTotal: products.length,
  };
}

export type ProductReport = Awaited<ReturnType<typeof productReport>>;
