import type { PrismaClient } from "@/generated/prisma/client";
import { normalizeCouponCode, parseDecimalToCents } from "@/domain";
import type { ShopifyClient } from "./client";

/**
 * Pedido do Shopify → `Order`/`OrderLine`. Uma única função (`processOrder`) grava o pedido, venha ele do
 * webhook, da reconciliação ou da carga histórica. Só grava se a versão (`updatedAt`) for mais nova que a
 * guardada. Atribuição e comissão ficam para a E5.
 */

type Money = { shopMoney: { amount: string } };

export type ShopifyOrderNode = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  cancelledAt: string | null;
  test: boolean;
  taxesIncluded: boolean;
  displayFinancialStatus: string | null;
  currencyCode: string;
  discountCodes: string[];
  currentSubtotalPriceSet: Money;
  currentTotalPriceSet: Money;
  transactions: Array<{ kind: string; status: string; processedAt: string | null }>;
  lineItems: {
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    nodes: Array<{ id: string; title: string; currentQuantity: number; discountedTotalSet: Money }>;
  };
};

export const ORDER_FIELDS = `
  id name createdAt updatedAt cancelledAt test taxesIncluded displayFinancialStatus currencyCode discountCodes
  currentSubtotalPriceSet { shopMoney { amount } }
  currentTotalPriceSet { shopMoney { amount } }
  transactions(first: 100) { kind status processedAt }`;

export const LINE_ITEMS = `
  pageInfo { hasNextPage endCursor }
  nodes { id title currentQuantity discountedTotalSet { shopMoney { amount } } }`;

export const ORDER_QUERY = `query Order($id: ID!, $after: String) {
  order(id: $id) { ${ORDER_FIELDS}
    lineItems(first: 250, after: $after) { ${LINE_ITEMS} } } }`;

/**
 * Data do pagamento (D-PAIDAT): a primeira transação `SALE` ou `CAPTURE` com sucesso. Sem ela, o pedido não está
 * pago (ex.: Pix ou boleto ainda não pagos), mesmo que já exista.
 */
export function paidAtOf(transactions: ShopifyOrderNode["transactions"]): Date | null {
  const times = transactions
    .filter((t) => (t.kind === "SALE" || t.kind === "CAPTURE") && t.status === "SUCCESS" && t.processedAt)
    .map((t) => new Date(t.processedAt!).getTime());
  return times.length ? new Date(Math.min(...times)) : null;
}

export function mapShopifyOrder(node: ShopifyOrderNode, brandId: string) {
  const order = {
    brandId,
    shopifyId: node.id,
    name: node.name,
    createdAtShop: new Date(node.createdAt),
    paidAt: paidAtOf(node.transactions),
    cancelledAt: node.cancelledAt ? new Date(node.cancelledAt) : null,
    financialStatus: node.displayFinancialStatus ?? "UNKNOWN",
    test: node.test,
    taxesIncluded: node.taxesIncluded,
    subtotalCents: parseDecimalToCents(node.currentSubtotalPriceSet.shopMoney.amount),
    totalCents: parseDecimalToCents(node.currentTotalPriceSet.shopMoney.amount),
    currency: node.currencyCode,
    // Ordem preservada: a atribuição (E5) usa o primeiro cupom CREATOR da lista.
    discountCodes: node.discountCodes,
    shopifyUpdatedAt: new Date(node.updatedAt),
  };
  const lines = node.lineItems.nodes.map((l) => ({
    shopifyId: l.id,
    title: l.title,
    quantity: l.currentQuantity,
    discountedTotalCents: parseDecimalToCents(l.discountedTotalSet.shopMoney.amount),
  }));
  return { order, lines };
}

export type ProcessOrderResult = {
  outcome: "created" | "updated" | "stale";
  orderId: string | null;
  /** D-TAX: a loja não usa imposto incluso; se um pedido vier com imposto incluso, avisar em vez de calcular. */
  warnings: Array<"taxes_included" | "currency_not_brl">;
};

export async function processOrder(prisma: PrismaClient, brandId: string, node: ShopifyOrderNode): Promise<ProcessOrderResult> {
  if (node.lineItems.pageInfo.hasNextPage) throw new Error(`Pedido ${node.name} com itens não carregados por inteiro.`);
  const { order, lines } = mapShopifyOrder(node, brandId);
  const warnings: ProcessOrderResult["warnings"] = [];
  if (order.taxesIncluded) warnings.push("taxes_included");
  if (order.currency !== "BRL") warnings.push("currency_not_brl");

  // Todo código visto num pedido vira cupom da marca; sem tipo até a Ana classificar (D-CLASS).
  const codes = [...new Set(order.discountCodes.map(normalizeCouponCode).filter(Boolean))];

  return prisma.$transaction(async (tx) => {
    const key = { brandId, shopifyId: order.shopifyId };
    if (codes.length) await tx.coupon.createMany({ data: codes.map((code) => ({ brandId, code })), skipDuplicates: true });
    // Atualiza só se a foto recebida for mais nova; senão cria (se ainda não existe). Sem corrida: o banco decide.
    const { brandId: _b, shopifyId: _s, ...fields } = order;
    const updated = await tx.order.updateMany({
      where: { ...key, shopifyUpdatedAt: { lt: order.shopifyUpdatedAt } },
      data: { ...fields, syncedAt: new Date() },
    });
    let outcome: ProcessOrderResult["outcome"] = "updated";
    if (updated.count === 0) {
      const created = await tx.order.createMany({ data: [order], skipDuplicates: true });
      if (created.count === 0) {
        // Versão igual ou antiga: nada muda, mas devolve o pedido para a liquidação ser refeita se algo falhou antes.
        const existing = await tx.order.findUnique({ where: { brandId_shopifyId: key }, select: { id: true } });
        return { outcome: "stale" as const, orderId: existing?.id ?? null, warnings };
      }
      outcome = "created";
    }
    const { id: orderId } = await tx.order.findUniqueOrThrow({ where: { brandId_shopifyId: key }, select: { id: true } });
    for (const line of lines) {
      await tx.orderLine.upsert({
        where: { orderId_shopifyId: { orderId, shopifyId: line.shopifyId } },
        create: { ...line, orderId, brandId },
        update: { title: line.title, quantity: line.quantity, discountedTotalCents: line.discountedTotalCents },
      });
    }
    return { outcome, orderId, warnings };
  });
}

/** Busca um pedido completo (todas as páginas de itens). `null` se o Shopify não o encontra. */
export async function fetchOrder(client: ShopifyClient, orderGid: string): Promise<ShopifyOrderNode | null> {
  let after: string | null = null;
  let order: ShopifyOrderNode | null = null;
  do {
    const data: { order: ShopifyOrderNode | null } = await client.graphql(ORDER_QUERY, { id: orderGid, after });
    if (!data.order) return null;
    if (!order) order = data.order;
    else order.lineItems.nodes.push(...data.order.lineItems.nodes);
    order.lineItems.pageInfo = data.order.lineItems.pageInfo;
    after = data.order.lineItems.pageInfo.hasNextPage ? data.order.lineItems.pageInfo.endCursor : null;
  } while (after);
  return order;
}
