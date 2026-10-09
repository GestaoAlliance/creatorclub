import type { PrismaClient } from "@/generated/prisma/client";
import type { Actor } from "@/lib/auth/actor";
import { can } from "@/lib/auth/permissions";
import { enqueueJob, type ClaimedJob, type JobHandler } from "@/lib/jobs/queue";
import type { ShopifyClient } from "./client";
import { decideAttribution } from "@/lib/commission/attribution";
import { ORDER_SYNC_JOB, defaultClientFactory, recordOrderWarnings, type ClientFactory } from "./jobs";
import { LINE_ITEMS, ORDER_FIELDS, processOrder, type ShopifyOrderNode } from "./orders";

/**
 * Reconciliação (rede de segurança do webhook): a cada 15 min, relê no Shopify os pedidos alterados desde a última
 * passada, com 30 min de margem, e grava com `processOrder`. Cada passada fica em `SyncRun`.
 * O agendamento sai do próprio worker (`enqueueDueReconciles`), chamado a cada minuto pelo pg_cron (D-CRON).
 */

export const RECONCILE_JOB = "shopify.reconcile";
export const RECONCILE_EVERY_MS = 15 * 60_000;
export const RECONCILE_MARGIN_MS = 30 * 60_000;
/** Limite por passada (25 pedidos por página); o que sobrar entra na passada seguinte. */
export const RECONCILE_MAX_PAGES = 20;

const CHANGED_ORDERS_QUERY = `query Changed($q: String!, $after: String) {
  orders(first: 25, after: $after, query: $q, sortKey: UPDATED_AT) {
    pageInfo { hasNextPage endCursor }
    nodes { ${ORDER_FIELDS} lineItems(first: 50) { ${LINE_ITEMS} } } } }`;

type ChangedOrders = { orders: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: ShopifyOrderNode[] } };

export type ReconcileResult = { syncRunId: string; since: Date; cursor: Date; ordersSeen: number; ordersFixed: number; deferred: number };

/** Início da janela: cursor da última passada concluída menos a margem; sem passada anterior, `now` menos a margem. */
export async function reconcileSince(prisma: PrismaClient, brandId: string, now: Date): Promise<Date> {
  const last = await prisma.syncRun.findFirst({
    where: { brandId, kind: "incremental", finishedAt: { not: null }, error: null, cursor: { not: null } },
    orderBy: { cursor: "desc" },
  });
  return new Date((last?.cursor ?? now).getTime() - RECONCILE_MARGIN_MS);
}

export async function reconcileBrand(
  prisma: PrismaClient,
  brandId: string,
  client: ShopifyClient,
  opts: { now?: Date; jobId?: string } = {},
): Promise<ReconcileResult> {
  const now = opts.now ?? new Date();
  const since = await reconcileSince(prisma, brandId, now);
  const run = await prisma.syncRun.create({ data: { brandId, kind: "incremental", startedAt: now } });
  const counts = { ordersSeen: 0, ordersFixed: 0, deferred: 0 };
  let cursor = now;
  try {
    const q = `updated_at:>='${since.toISOString()}'`;
    let after: string | null = null;
    let lastSeen: Date | null = null;
    for (let page = 0; ; page++) {
      const data: ChangedOrders = await client.graphql(CHANGED_ORDERS_QUERY, { q, after });
      for (const node of data.orders.nodes) {
        counts.ordersSeen++;
        lastSeen = new Date(node.updatedAt);
        if (node.lineItems.pageInfo.hasNextPage) {
          // Pedido com muitos itens: busca completa numa tarefa própria.
          await enqueueJob(prisma, {
            type: ORDER_SYNC_JOB,
            brandId,
            payload: { orderGid: node.id },
            dedupeKey: `order:${brandId}:${node.id}:${node.updatedAt}`,
          });
          counts.deferred++;
          continue;
        }
        const result = await processOrder(prisma, brandId, node);
        if (result.outcome !== "stale") counts.ordersFixed++;
        if (result.orderId) await decideAttribution(prisma, result.orderId);
        await recordOrderWarnings(prisma, brandId, opts.jobId ?? run.id, result, node.name);
      }
      if (!data.orders.pageInfo.hasNextPage) break;
      if (page + 1 === RECONCILE_MAX_PAGES) {
        // Parou no limite: a próxima passada recomeça do último pedido visto (cursor − margem = ele).
        cursor = new Date(lastSeen!.getTime() + RECONCILE_MARGIN_MS);
        break;
      }
      after = data.orders.pageInfo.endCursor;
    }
  } catch (error) {
    await prisma.syncRun.update({
      where: { id: run.id },
      data: { finishedAt: new Date(), error: (error instanceof Error ? error.message : String(error)).slice(0, 2000), ordersSeen: counts.ordersSeen, ordersFixed: counts.ordersFixed },
    });
    throw error;
  }
  await prisma.$transaction([
    prisma.syncRun.update({ where: { id: run.id }, data: { finishedAt: new Date(), cursor, ordersSeen: counts.ordersSeen, ordersFixed: counts.ordersFixed } }),
    prisma.brandIntegration.update({ where: { brandId_kind: { brandId, kind: "SHOPIFY" } }, data: { lastSyncAt: now } }),
  ]);
  return { syncRunId: run.id, since, cursor, ...counts };
}

export function reconcileHandler(prisma: PrismaClient, clientFor: ClientFactory = defaultClientFactory): JobHandler {
  return async (job: ClaimedJob) => {
    if (!job.brandId) throw new Error("Tarefa sem marca.");
    await reconcileBrand(prisma, job.brandId, await clientFor(prisma, job.brandId), { jobId: job.id });
  };
}

/** Uma reconciliação por marca conectada a cada 15 min (a chave do intervalo evita duplicar). */
export async function enqueueDueReconciles(prisma: PrismaClient, now = new Date()): Promise<number> {
  const slot = Math.floor(now.getTime() / RECONCILE_EVERY_MS);
  const brands = await prisma.brandIntegration.findMany({ where: { kind: "SHOPIFY", status: "CONNECTED" }, select: { brandId: true } });
  let created = 0;
  for (const { brandId } of brands) {
    if (await enqueueJob(prisma, { type: RECONCILE_JOB, brandId, dedupeKey: `reconcile:${brandId}:${slot}`, runAt: now })) created++;
  }
  return created;
}

/** "Sincronizar agora" (só quem conecta lojas: super admin). No máximo um pedido por minuto por marca. */
export async function requestSyncNow(prisma: PrismaClient, actor: Actor | null, brandId: string, now = new Date()): Promise<boolean> {
  if (!actor || !can(actor.grants, "integrations.manage", brandId)) throw new Error("Sem permissão.");
  const minute = Math.floor(now.getTime() / 60_000);
  return prisma.$transaction(async (tx) => {
    const created = await enqueueJob(tx, { type: RECONCILE_JOB, brandId, dedupeKey: `reconcile:${brandId}:manual:${minute}`, runAt: now });
    if (created) {
      await tx.auditLog.create({
        data: { brandId, actorType: "USER", actorId: actor.userId, action: "sync.request", entity: "Brand", entityId: brandId },
      });
    }
    return created;
  });
}
