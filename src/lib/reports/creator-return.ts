import type { PrismaClient } from "@/generated/prisma/client";
import { PAID_FINANCIAL } from "@/domain";
import { productResolver } from "./products";

/**
 * Retorno por creator (M3.3, D-RETURN), num intervalo [gte, lt) pela data do pagamento (D-MONTH):
 * - **lucro que ela deixa** = receita dos pedidos dela (já com desconto) − custo dos produtos (Shopify) − comissão dela
 *   − kits enviados a ela (custo dos produtos) − frete desses envios — a mesma régua do lucro do programa (D-COST);
 * - **clientes novas × recorrentes**: nova = o pedido é a primeira compra registrada daquela cliente na loja (pelo id
 *   da cliente na Shopify, só com `read_customers`); sem o id, conta como "sem dado".
 * Produto sem custo e envio sem frete entram sem custo e são contados à parte. Só leitura.
 */

export type CreatorReturn = {
  orders: number;
  revenueCents: number;
  cogsCents: number;
  commissionCents: number;
  kitsCents: number;
  freightCents: number;
  profitCents: number;
  unitsWithoutCost: number;
  customers: { new: number; returning: number; unknown: number };
};

const empty = (): CreatorReturn => ({
  orders: 0,
  revenueCents: 0,
  cogsCents: 0,
  commissionCents: 0,
  kitsCents: 0,
  freightCents: 0,
  profitCents: 0,
  unitsWithoutCost: 0,
  customers: { new: 0, returning: 0, unknown: 0 },
});

export async function creatorReturns(
  prisma: PrismaClient,
  brandId: string,
  range: { gte: Date; lt: Date },
  creatorIds?: readonly string[],
): Promise<Map<string, CreatorReturn>> {
  const only = creatorIds ? { creatorId: { in: [...creatorIds] } } : {};
  const orders = await prisma.order.findMany({
    where: {
      brandId,
      cancelledAt: null,
      test: false,
      financialStatus: { in: [...PAID_FINANCIAL] },
      paidAt: { gte: range.gte, lt: range.lt },
      attribution: { is: only },
    },
    select: { id: true, subtotalCents: true, createdAtShop: true, customerShopifyId: true, attribution: { select: { creatorId: true } } },
  });
  const ids = orders.map((o) => o.id);
  const customerIds = [...new Set(orders.map((o) => o.customerShopifyId).filter((c): c is string => c !== null))];
  const [lines, products, ledger, shipments, firsts] = await Promise.all([
    ids.length ? prisma.orderLine.findMany({ where: { brandId, orderId: { in: ids } }, select: { orderId: true, title: true, quantity: true, productShopifyId: true } }) : [],
    prisma.product.findMany({ where: { brandId }, select: { id: true, shopifyId: true, title: true, costCents: true } }),
    ids.length
      ? prisma.ledgerEntry.groupBy({ by: ["orderId"], where: { brandId, orderId: { in: ids }, type: { in: ["COMMISSION", "REVERSAL"] } }, _sum: { amountCents: true } })
      : [],
    prisma.shipment.findMany({
      where: { brandId, shippedAt: { gte: range.gte, lt: range.lt }, status: { in: ["SHIPPED", "DELIVERED"] }, ...only },
      select: { creatorId: true, freightCents: true, items: { select: { quantity: true, product: { select: { costCents: true } } } } },
    }),
    // Primeira compra registrada de cada cliente na loja (qualquer pedido pago, com ou sem cupom).
    customerIds.length
      ? prisma.order.groupBy({
          by: ["customerShopifyId"],
          where: { brandId, customerShopifyId: { in: customerIds }, cancelledAt: null, test: false, financialStatus: { in: [...PAID_FINANCIAL] } },
          _min: { createdAtShop: true },
        })
      : [],
  ]);

  const out = new Map<string, CreatorReturn>();
  const get = (id: string) => {
    let r = out.get(id);
    if (!r) out.set(id, (r = empty()));
    return r;
  };
  const owner = new Map(orders.map((o) => [o.id, o.attribution!.creatorId]));
  const first = new Map(firsts.map((f) => [f.customerShopifyId!, f._min.createdAtShop!.getTime()]));
  for (const o of orders) {
    const r = get(o.attribution!.creatorId);
    r.orders++;
    r.revenueCents += o.subtotalCents;
    if (!o.customerShopifyId) r.customers.unknown++;
    else if (first.get(o.customerShopifyId) === o.createdAtShop.getTime()) r.customers.new++;
    else r.customers.returning++;
  }
  const productOf = productResolver(products);
  for (const l of lines) {
    const r = get(owner.get(l.orderId)!);
    const cost = productOf(l)?.costCents ?? null;
    if (cost === null) r.unitsWithoutCost += l.quantity;
    else r.cogsCents += cost * l.quantity;
  }
  for (const e of ledger) if (e.orderId) get(owner.get(e.orderId)!).commissionCents += e._sum.amountCents ?? 0;
  for (const s of shipments) {
    const r = get(s.creatorId);
    r.freightCents += s.freightCents ?? 0;
    for (const i of s.items) r.kitsCents += (i.product.costCents ?? 0) * i.quantity;
  }
  for (const r of out.values()) r.profitCents = r.revenueCents - r.cogsCents - r.commissionCents - r.kitsCents - r.freightCents;
  return out;
}
