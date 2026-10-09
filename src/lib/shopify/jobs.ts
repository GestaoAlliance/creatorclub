import type { PrismaClient } from "@/generated/prisma/client";
import type { ClaimedJob, JobHandler } from "@/lib/jobs/queue";
import { createShopifyClient, type ShopifyClient } from "./client";
import { loadShopifyConnection } from "./credentials";
import { accessTokenFor } from "./token";
import { settleOrder } from "@/lib/commission/ledger";
import { fetchOrder, processOrder, type ProcessOrderResult } from "./orders";

/** Tarefa que busca um pedido no Shopify e grava com `processOrder`. Payload: `{ orderGid }`. */
export const ORDER_SYNC_JOB = "shopify.order.sync";

export type ClientFactory = (prisma: PrismaClient, brandId: string) => Promise<ShopifyClient>;

export const defaultClientFactory: ClientFactory = async (prisma, brandId) => {
  const conn = await loadShopifyConnection(prisma, brandId);
  if (!conn) throw new Error("Marca sem Shopify conectado.");
  const accessToken = await accessTokenFor(brandId, conn);
  return createShopifyClient({ shop: conn.shop, accessToken, apiVersion: conn.apiVersion });
};

export function orderSyncHandler(prisma: PrismaClient, clientFor: ClientFactory = defaultClientFactory): JobHandler {
  return async (job: ClaimedJob) => {
    const payload = (job.payload ?? {}) as { orderGid?: unknown; webhookEventId?: unknown };
    const orderGid = payload.orderGid;
    if (!job.brandId || typeof orderGid !== "string") throw new Error("Tarefa sem marca ou sem pedido.");
    const markWebhook = async () => {
      if (typeof payload.webhookEventId !== "string") return;
      await prisma.webhookEvent.update({ where: { id: payload.webhookEventId }, data: { status: "PROCESSED", processedAt: new Date() } });
    };
    const node = await fetchOrder(await clientFor(prisma, job.brandId), orderGid);
    if (!node) return markWebhook(); // Pedido apagado no Shopify: nada a gravar.
    const result = await processOrder(prisma, job.brandId, node);
    if (result.orderId) await settleOrder(prisma, result.orderId);
    await markWebhook();
    await recordOrderWarnings(prisma, job.brandId, job.id, result, node.name);
  };
}

/** Aviso do pedido (D-TAX) fica na auditoria: aparece na tela de saúde (E3.7) e bloqueia o cálculo na E5. */
export async function recordOrderWarnings(prisma: PrismaClient, brandId: string, jobId: string, result: ProcessOrderResult, name: string) {
  if (result.outcome === "stale" || result.warnings.length === 0 || !result.orderId) return;
  await prisma.auditLog.create({
    data: {
      brandId,
      actorType: "JOB",
      actorId: jobId,
      action: "order.warning",
      entity: "Order",
      entityId: result.orderId,
      after: { warnings: result.warnings, name },
    },
  });
}
