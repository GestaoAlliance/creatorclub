import type { PrismaClient } from "@/generated/prisma/client";
import type { Actor } from "@/lib/auth/actor";
import { brandsWith } from "@/lib/auth/permissions";

/** Dados da tela de saúde do sync (E3.7): só para quem conecta lojas (super admin). Nada aqui consulta o Shopify. */
export async function syncHealth(prisma: PrismaClient, actor: Actor, now = new Date()) {
  const allowed = brandsWith(actor.grants, "integrations.manage");
  if (allowed !== "ALL" && allowed.length === 0) throw new Error("Sem permissão.");
  const brandWhere = allowed === "ALL" ? {} : { id: { in: allowed } };
  const since24h = new Date(now.getTime() - 24 * 3600_000);

  const brands = await prisma.brand.findMany({
    where: { ...brandWhere, archivedAt: null },
    orderBy: { name: "asc" },
    select: {
      id: true,
      slug: true,
      name: true,
      integrations: { where: { kind: "SHOPIFY" }, select: { status: true, externalId: true, scopes: true, lastSyncAt: true } },
    },
  });

  return Promise.all(
    brands.map(async (b) => {
      const [runs, pending, failed, failedJobs, webhooks, warnings, orders] = await Promise.all([
        prisma.syncRun.findMany({ where: { brandId: b.id }, orderBy: { startedAt: "desc" }, take: 10 }),
        prisma.job.count({ where: { brandId: b.id, status: { in: ["PENDING", "RUNNING"] } } }),
        prisma.job.count({ where: { brandId: b.id, status: "FAILED", finishedAt: { gte: since24h } } }),
        prisma.job.findMany({
          where: { brandId: b.id, status: "FAILED" },
          orderBy: { finishedAt: "desc" },
          take: 5,
          select: { id: true, type: true, lastError: true, finishedAt: true, attempts: true },
        }),
        prisma.webhookEvent.groupBy({ by: ["status"], where: { brandId: b.id, receivedAt: { gte: since24h } }, _count: true }),
        prisma.auditLog.findMany({
          where: { brandId: b.id, action: "order.warning" },
          orderBy: { createdAt: "desc" },
          take: 10,
          select: { id: true, entityId: true, after: true, createdAt: true },
        }),
        prisma.order.count({ where: { brandId: b.id } }),
      ]);
      return {
        brand: { id: b.id, slug: b.slug, name: b.name },
        shopify: b.integrations[0] ?? null,
        runs,
        jobs: { pending, failed24h: failed, recentFailures: failedJobs },
        webhooks24h: Object.fromEntries(webhooks.map((w) => [w.status, w._count])) as Record<string, number>,
        warnings,
        orders,
      };
    }),
  );
}
