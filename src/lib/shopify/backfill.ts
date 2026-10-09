import type { PrismaClient } from "@/generated/prisma/client";
import type { Actor } from "@/lib/auth/actor";
import { can } from "@/lib/auth/permissions";
import { enqueueJob, type ClaimedJob, type JobHandler } from "@/lib/jobs/queue";
import { decideAttribution } from "@/lib/commission/attribution";
import { defaultClientFactory, recordOrderWarnings, type ClientFactory } from "./jobs";
import { processOrder, type ShopifyOrderNode } from "./orders";

/**
 * Carga histórica (D-HIST) por Bulk Operation do Shopify, em tarefas encadeadas na fila:
 * `start` pede a exportação → `poll` acompanha a cada 30 s → `import` baixa o arquivo (JSONL) e grava os pedidos
 * com `processOrder`, em lotes, retomando do ponto em que parou. A passada fica em `SyncRun` (kind `backfill`).
 * A data de início vem de quem dispara (super admin), definida pelo primeiro cupom de creator (depende de D-CLASS).
 */

export const BACKFILL_START_JOB = "shopify.backfill.start";
export const BACKFILL_POLL_JOB = "shopify.backfill.poll";
export const BACKFILL_IMPORT_JOB = "shopify.backfill.import";
const BACKFILL_JOBS = ["shopify.backfill.start", "shopify.backfill.poll", "shopify.backfill.import"];
export const POLL_EVERY_MS = 30_000;
export const MAX_POLLS = 240; // 2 h
export const IMPORT_BATCH = 200;

export function bulkOrdersQuery(since: Date): string {
  return `{ orders(query: "created_at:>='${since.toISOString()}'") { edges { node {
    id name createdAt updatedAt cancelledAt test taxesIncluded displayFinancialStatus currencyCode discountCodes
    currentSubtotalPriceSet { shopMoney { amount } } currentTotalPriceSet { shopMoney { amount } }
    transactions { kind status processedAt }
    lineItems { edges { node { id title currentQuantity discountedTotalSet { shopMoney { amount } } } } } } } } }`;
}

const START_MUTATION = `mutation Start($query: String!) {
  bulkOperationRunQuery(query: $query) { bulkOperation { id status } userErrors { field message } } }`;

const POLL_QUERY = `query Poll($id: ID!) { node(id: $id) { ... on BulkOperation { id status errorCode objectCount url } } }`;

/** Monta os pedidos a partir do JSONL: cada pedido numa linha, seus itens nas linhas seguintes com `__parentId`. */
export function parseBulkOrders(jsonl: string): ShopifyOrderNode[] {
  const orders: ShopifyOrderNode[] = [];
  const byId = new Map<string, ShopifyOrderNode>();
  for (const line of jsonl.split("\n")) {
    if (!line.trim()) continue;
    const obj = JSON.parse(line) as Record<string, unknown> & { id: string; __parentId?: string };
    if (obj.__parentId) {
      const parent = byId.get(obj.__parentId);
      if (!parent) throw new Error(`Item sem pedido no arquivo: ${obj.id}`);
      const { __parentId: _p, ...item } = obj;
      parent.lineItems.nodes.push(item as unknown as ShopifyOrderNode["lineItems"]["nodes"][number]);
      continue;
    }
    const order = { ...obj, lineItems: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [] } } as unknown as ShopifyOrderNode;
    orders.push(order);
    byId.set(order.id, order);
  }
  return orders;
}

/** Pede a carga histórica de uma marca. Só super admin; uma carga por vez por marca. */
export async function startHistoricalImport(prisma: PrismaClient, actor: Actor | null, brandId: string, since: Date): Promise<string> {
  if (!actor || !can(actor.grants, "integrations.manage", brandId)) throw new Error("Sem permissão.");
  if (Number.isNaN(since.getTime())) throw new Error("Data de início inválida.");
  return prisma.$transaction(async (tx) => {
    const open = await tx.syncRun.findFirst({ where: { brandId, kind: "backfill", finishedAt: null } });
    if (open) {
      const alive = await tx.job.count({
        where: { brandId, type: { in: BACKFILL_JOBS }, status: { in: ["PENDING", "RUNNING"] } },
      });
      if (alive > 0) throw new Error("Já existe uma carga histórica em andamento para esta marca.");
      // Carga anterior parou (tarefa falhou de vez): fecha com erro e deixa começar outra.
      await tx.syncRun.update({ where: { id: open.id }, data: { finishedAt: new Date(), error: "Interrompida (tarefa falhou)." } });
    }
    const run = await tx.syncRun.create({ data: { brandId, kind: "backfill", cursor: since } });
    await enqueueJob(tx, { type: BACKFILL_START_JOB, brandId, payload: { syncRunId: run.id }, dedupeKey: `backfill:${run.id}:start` });
    await tx.auditLog.create({
      data: { brandId, actorType: "USER", actorId: actor.userId, action: "sync.backfill", entity: "SyncRun", entityId: run.id, after: { since: since.toISOString() } },
    });
    return run.id;
  });
}

export type BackfillDeps = { clientFor?: ClientFactory; fetch?: typeof fetch; now?: () => Date };

type Payload = { syncRunId: string; operationId?: string; polls?: number; url?: string; offset?: number };

const payloadOf = (job: ClaimedJob): Payload => {
  const p = (job.payload ?? {}) as Payload;
  if (!job.brandId || typeof p.syncRunId !== "string") throw new Error("Tarefa sem marca ou sem passada.");
  return p;
};

async function finishRun(prisma: PrismaClient, syncRunId: string, error: string | null) {
  await prisma.syncRun.update({ where: { id: syncRunId }, data: { finishedAt: new Date(), error } });
}

export function backfillHandlers(prisma: PrismaClient, deps: BackfillDeps = {}): Record<string, JobHandler> {
  const clientFor = deps.clientFor ?? defaultClientFactory;
  const now = deps.now ?? (() => new Date());
  const doFetch = deps.fetch ?? fetch;

  const start: JobHandler = async (job) => {
    const p = payloadOf(job);
    const run = await prisma.syncRun.findUniqueOrThrow({ where: { id: p.syncRunId } });
    const client = await clientFor(prisma, job.brandId!);
    const data: {
      bulkOperationRunQuery: { bulkOperation: { id: string } | null; userErrors: Array<{ message: string }> };
    } = await client.graphql(START_MUTATION, { query: bulkOrdersQuery(run.cursor!) });
    const { bulkOperation, userErrors } = data.bulkOperationRunQuery;
    if (!bulkOperation) throw new Error(`Shopify recusou a exportação: ${userErrors.map((e) => e.message).join("; ")}`);
    await enqueueJob(prisma, {
      type: BACKFILL_POLL_JOB,
      brandId: job.brandId,
      payload: { syncRunId: p.syncRunId, operationId: bulkOperation.id, polls: 0 },
      dedupeKey: `backfill:${p.syncRunId}:poll:0`,
      runAt: new Date(now().getTime() + POLL_EVERY_MS),
    });
  };

  const poll: JobHandler = async (job) => {
    const p = payloadOf(job);
    const client = await clientFor(prisma, job.brandId!);
    const data: { node: { status: string; errorCode: string | null; url: string | null } | null } = await client.graphql(POLL_QUERY, {
      id: p.operationId,
    });
    const status = data.node?.status ?? "MISSING";
    if (status === "COMPLETED") {
      if (!data.node!.url) return finishRun(prisma, p.syncRunId, null); // Nenhum pedido no período.
      await enqueueJob(prisma, {
        type: BACKFILL_IMPORT_JOB,
        brandId: job.brandId,
        payload: { syncRunId: p.syncRunId, url: data.node!.url, offset: 0 },
        dedupeKey: `backfill:${p.syncRunId}:import:0`,
      });
      return;
    }
    if (status === "CREATED" || status === "RUNNING") {
      const polls = (p.polls ?? 0) + 1;
      if (polls > MAX_POLLS) return finishRun(prisma, p.syncRunId, "Exportação do Shopify demorou mais de 2 h.");
      await enqueueJob(prisma, {
        type: BACKFILL_POLL_JOB,
        brandId: job.brandId,
        payload: { ...p, polls },
        dedupeKey: `backfill:${p.syncRunId}:poll:${polls}`,
        runAt: new Date(now().getTime() + POLL_EVERY_MS),
      });
      return;
    }
    await finishRun(prisma, p.syncRunId, `Exportação do Shopify terminou como ${status}${data.node?.errorCode ? ` (${data.node.errorCode})` : ""}.`);
  };

  const importBatch: JobHandler = async (job) => {
    const p = payloadOf(job);
    const res = await doFetch(p.url!);
    if (!res.ok) throw new Error(`Falha ao baixar a exportação (${res.status}).`);
    const orders = parseBulkOrders(await res.text());
    const offset = p.offset ?? 0;
    const batch = orders.slice(offset, offset + IMPORT_BATCH);
    let fixed = 0;
    for (const node of batch) {
      const result = await processOrder(prisma, job.brandId!, node);
      if (result.outcome !== "stale") fixed++;
      if (result.orderId) await decideAttribution(prisma, result.orderId);
      await recordOrderWarnings(prisma, job.brandId!, job.id, result, node.name);
    }
    await prisma.syncRun.update({
      where: { id: p.syncRunId },
      data: { ordersSeen: { increment: batch.length }, ordersFixed: { increment: fixed } },
    });
    const next = offset + batch.length;
    if (next < orders.length) {
      await enqueueJob(prisma, {
        type: BACKFILL_IMPORT_JOB,
        brandId: job.brandId,
        payload: { ...p, offset: next },
        dedupeKey: `backfill:${p.syncRunId}:import:${next}`,
      });
      return;
    }
    await finishRun(prisma, p.syncRunId, null);
  };

  return { [BACKFILL_START_JOB]: start, [BACKFILL_POLL_JOB]: poll, [BACKFILL_IMPORT_JOB]: importBatch };
}
