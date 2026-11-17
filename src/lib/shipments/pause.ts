import type { PrismaClient } from "@/generated/prisma/client";
import type { Actor } from "@/lib/auth/actor";
import { can } from "@/lib/auth/permissions";
import { ShipmentError } from "./shipments";

/**
 * D-PRODUCTPAUSE (pedido da Vanessa em 2026-11-17): a equipe pausa os pedidos de produtos de uma marca. Com a pausa,
 * nenhuma creator da marca escolhe kit nem compra com o saldo, a equipe não aprova os pedidos que já estão esperando
 * (recusar continua) e os kits automáticos (mensal, meta e faixa) não são concedidos. O kit de boas-vindas da
 * aprovação continua sendo registrado e espera a volta.
 */

export const PAUSED_CREATOR = "Os pedidos de produtos estão pausados pela equipe no momento. Assim que voltarem, você consegue escolher por aqui.";
export const PAUSED_STAFF = "Os pedidos de produtos estão pausados nesta marca. Para aprovar, religue em Configurações › Marcas › Pedidos de produtos.";

type Db = Pick<PrismaClient, "brand">;

export async function requestsPaused(prisma: Db, brandId: string): Promise<boolean> {
  const b = await prisma.brand.findUnique({ where: { id: brandId }, select: { productRequestsPausedAt: true } });
  return Boolean(b?.productRequestsPausedAt);
}

/** Liga ou desliga a pausa (super admin ou a Gestão da marca), com o histórico. */
export async function setProductPause(prisma: PrismaClient, actor: Actor | null, brandId: string, paused: boolean, now = new Date()) {
  if (!actor || !can(actor.grants, "creators.edit", brandId)) throw new ShipmentError("Sem permissão.");
  const b = await prisma.brand.findUnique({ where: { id: brandId }, select: { productRequestsPausedAt: true } });
  if (!b) throw new ShipmentError("Marca não encontrada.");
  if (Boolean(b.productRequestsPausedAt) === paused) return;
  await prisma.$transaction([
    prisma.brand.update({ where: { id: brandId }, data: { productRequestsPausedAt: paused ? now : null } }),
    prisma.auditLog.create({
      data: { brandId, actorType: "USER", actorId: actor.userId, action: "brand.product_pause", entity: "Brand", entityId: brandId, before: { pausedAt: b.productRequestsPausedAt?.toISOString() ?? null }, after: { paused } },
    }),
  ]);
}
