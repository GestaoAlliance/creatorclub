import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import type { Notice } from "@/domain";
import type { PortalContext } from "@/lib/portal/context";

/**
 * Avisos para a creator (U5, D-NOTICES). Gravados junto com o acontecimento (na mesma transação, quando há) e sem
 * repetir: a chave (`dedupeKey`) é única por creator. O portal mostra no sininho; o e-mail sai quando houver remetente.
 */

type Db = PrismaClient | Prisma.TransactionClient;

export async function notify(db: Db, rows: { brandId: string; creatorId: string; notice: Notice }[]): Promise<number> {
  if (rows.length === 0) return 0;
  const slugs = new Map(
    (await db.brand.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.brandId))] } }, select: { id: true, slug: true } })).map((b) => [b.id, b.slug]),
  );
  const { count } = await db.notification.createMany({
    data: rows.map(({ brandId, creatorId, notice: n }) => ({
      brandId,
      creatorId,
      kind: n.kind,
      dedupeKey: n.dedupeKey,
      title: n.title,
      body: n.body,
      href: n.path ? `/portal/${slugs.get(brandId)}${n.path}` : null,
    })),
    skipDuplicates: true,
  });
  return count;
}

/** Avisos da creator no portal, mais novos primeiro. */
export async function myNotifications(prisma: PrismaClient, ctx: Pick<PortalContext, "creatorId" | "brand">) {
  return prisma.notification.findMany({
    where: { creatorId: ctx.creatorId, brandId: ctx.brand.id },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: { id: true, kind: true, title: true, body: true, href: true, createdAt: true, readAt: true },
  });
}

export async function unreadCount(prisma: PrismaClient, ctx: Pick<PortalContext, "creatorId" | "brand">) {
  return prisma.notification.count({ where: { creatorId: ctx.creatorId, brandId: ctx.brand.id, readAt: null } });
}

/** Abrir a lista marca tudo como lido. A equipe vendo o portal (D-VIEWAS) não marca nada. */
export async function markAllRead(prisma: PrismaClient, ctx: Pick<PortalContext, "creatorId" | "brand" | "viewAs">, now = new Date()) {
  if (ctx.viewAs) return 0;
  const { count } = await prisma.notification.updateMany({ where: { creatorId: ctx.creatorId, brandId: ctx.brand.id, readAt: null }, data: { readAt: now } });
  return count;
}
