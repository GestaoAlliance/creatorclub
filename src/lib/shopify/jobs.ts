import type { PrismaClient } from "@/generated/prisma/client";
import type { ClaimedJob, JobHandler } from "@/lib/jobs/queue";
import { createShopifyClient, type ShopifyClient } from "./client";
import { loadShopifyConnection } from "./credentials";
import { fetchOrder, processOrder } from "./orders";

/** Tarefa que busca um pedido no Shopify e grava com `processOrder`. Payload: `{ orderGid }`. */
export const ORDER_SYNC_JOB = "shopify.order.sync";

export type ClientFactory = (prisma: PrismaClient, brandId: string) => Promise<ShopifyClient>;

export const defaultClientFactory: ClientFactory = async (prisma, brandId) => {
  const conn = await loadShopifyConnection(prisma, brandId);
  if (!conn) throw new Error("Marca sem Shopify conectado.");
  return createShopifyClient({ shop: conn.shop, accessToken: conn.accessToken, apiVersion: conn.apiVersion });
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
    await markWebhook();
    if (result.warnings.length > 0 && result.orderId) {
      // Fica registrado para a tela de saúde do sync (E3.7) e bloqueia o cálculo na E5.
      await prisma.auditLog.create({
        data: {
          brandId: job.brandId,
          actorType: "JOB",
          actorId: job.id,
          action: "order.warning",
          entity: "Order",
          entityId: result.orderId,
          after: { warnings: result.warnings, name: node.name },
        },
      });
    }
  };
}
