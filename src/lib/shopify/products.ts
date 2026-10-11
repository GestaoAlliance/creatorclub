import type { PrismaClient } from "@/generated/prisma/client";
import type { Actor } from "@/lib/auth/actor";
import { can } from "@/lib/auth/permissions";
import { enqueueJob, type ClaimedJob, type JobHandler } from "@/lib/jobs/queue";
import type { ShopifyClient } from "./client";
import { defaultClientFactory, type ClientFactory } from "./jobs";

/**
 * Catálogo da loja (D-SHIPPRODUCTS): os produtos do Shopify de cada marca em `Product`, para envios e kits.
 * Roda uma vez por dia, ao conectar a loja e pelo botão na tela Shopify. Produto que sumiu ou não está ativo fica
 * inativo (nada é apagado: envios antigos apontam para ele).
 */
export const PRODUCTS_JOB = "shopify.products.sync";
export const PRODUCTS_MAX_PAGES = 20;

const PRODUCTS_QUERY = `query Products($after: String) {
  products(first: 100, after: $after, sortKey: ID) { nodes { id title status } pageInfo { hasNextPage endCursor } } }`;

type ProductsPage = { products: { nodes: Array<{ id: string; title: string; status: string }>; pageInfo: { hasNextPage: boolean; endCursor: string | null } } };

export type ProductsSyncResult = { seen: number; created: number; updated: number; deactivated: number };

export async function syncProducts(prisma: PrismaClient, brandId: string, client: ShopifyClient): Promise<ProductsSyncResult> {
  const seen = new Map<string, { title: string; active: boolean }>();
  let after: string | null = null;
  for (let page = 0; page < PRODUCTS_MAX_PAGES; page++) {
    const res: ProductsPage = await client.graphql<ProductsPage>(PRODUCTS_QUERY, { after });
    for (const p of res.products.nodes) seen.set(p.id, { title: p.title.trim(), active: p.status === "ACTIVE" });
    if (!res.products.pageInfo.hasNextPage) break;
    after = res.products.pageInfo.endCursor;
    if (page === PRODUCTS_MAX_PAGES - 1) throw new Error("Catálogo maior que o limite de páginas; nada foi desativado.");
  }
  const existing = await prisma.product.findMany({ where: { brandId }, select: { id: true, shopifyId: true, title: true, active: true } });
  const byShopify = new Map(existing.map((p) => [p.shopifyId, p]));
  const result: ProductsSyncResult = { seen: seen.size, created: 0, updated: 0, deactivated: 0 };
  await prisma.$transaction(async (tx) => {
    for (const [shopifyId, p] of seen) {
      const old = byShopify.get(shopifyId);
      if (!old) {
        await tx.product.create({ data: { brandId, shopifyId, title: p.title, active: p.active } });
        result.created++;
      } else if (old.title !== p.title || old.active !== p.active) {
        await tx.product.update({ where: { id: old.id }, data: { title: p.title, active: p.active } });
        result.updated++;
      }
    }
    const gone = existing.filter((p) => p.active && !seen.has(p.shopifyId)).map((p) => p.id);
    if (gone.length) result.deactivated = (await tx.product.updateMany({ where: { id: { in: gone } }, data: { active: false } })).count;
  });
  return result;
}

export function productsSyncHandler(prisma: PrismaClient, clientFor: ClientFactory = defaultClientFactory): JobHandler {
  return async (job: ClaimedJob) => {
    if (!job.brandId) throw new Error("Tarefa sem marca.");
    const r = await syncProducts(prisma, job.brandId, await clientFor(prisma, job.brandId));
    if (r.created || r.updated || r.deactivated) {
      await prisma.auditLog.create({ data: { brandId: job.brandId, actorType: "JOB", actorId: job.id, action: "products.sync", entity: "Brand", entityId: job.brandId, after: r } });
    }
  };
}

const day = (now: Date) => Math.floor(now.getTime() / 86_400_000);

/** Uma atualização do catálogo por dia para cada loja conectada (a chave do dia evita duplicar). */
export async function enqueueDueProductSyncs(prisma: PrismaClient, now = new Date()): Promise<number> {
  const brands = await prisma.brandIntegration.findMany({ where: { kind: "SHOPIFY", status: "CONNECTED" }, select: { brandId: true } });
  let created = 0;
  for (const { brandId } of brands) {
    if (await enqueueJob(prisma, { type: PRODUCTS_JOB, brandId, dedupeKey: `products:${brandId}:${day(now)}`, runAt: now })) created++;
  }
  return created;
}

/** "Atualizar catálogo" (quem conecta lojas) e logo depois de conectar. No máximo um pedido por minuto por marca. */
export async function requestProductSync(prisma: PrismaClient, actor: Actor | null, brandId: string, now = new Date()): Promise<boolean> {
  if (!actor || !can(actor.grants, "integrations.manage", brandId)) throw new Error("Sem permissão.");
  return enqueueJob(prisma, { type: PRODUCTS_JOB, brandId, dedupeKey: `products:${brandId}:manual:${Math.floor(now.getTime() / 60_000)}`, runAt: now });
}
