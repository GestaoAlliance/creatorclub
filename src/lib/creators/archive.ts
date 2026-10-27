import type { PrismaClient } from "@/generated/prisma/client";
import type { Actor } from "@/lib/auth/actor";
import { can } from "@/lib/auth/permissions";
import { DISCOUNT_BY_CODE_QUERY, DISCOUNT_UPDATE_MUTATION } from "@/lib/coupons/discount";
import { ShopifyError } from "@/lib/shopify/client";
import { defaultClientFactory, type ClientFactory } from "@/lib/shopify/jobs";

/**
 * Arquivar creator (D-ARCHIVECREATOR, pedido da Vanessa: "deletar creator"; o responsável escolheu arquivar, porque nada
 * é apagado). Arquivada some das listas e da busca, fica "Desligada" (sem pedidos, kits nem metas) e o cupom de creator
 * é encerrado na Shopify (quem usar não ganha mais o desconto) e marcado inativo. Vendas, extrato e saques ficam.
 * Desarquivar volta como "Pausada", com o cupom valendo de novo. A Shopify vai primeiro: se ela recusar, nada muda.
 */

export class ArchiveError extends Error {}

type ByCode = { codeDiscountNodeByCode: { id: string } | null };
type UpdateResult = { discountCodeBasicUpdate: { codeDiscountNode: { id: string } | null; userErrors: { message: string }[] } };

async function load(prisma: PrismaClient, actor: Actor | null, creatorId: string) {
  const creator = await prisma.creator.findUnique({
    where: { id: creatorId },
    select: {
      id: true,
      brandId: true,
      status: true,
      archivedAt: true,
      couponAssignments: { where: { validTo: null, coupon: { kind: "CREATOR" } }, select: { coupon: { select: { id: true, code: true, shopifyId: true } } } },
    },
  });
  if (!creator) throw new ArchiveError("Creator não encontrada.");
  if (!actor || !can(actor.grants, "creators.edit", creator.brandId)) throw new ArchiveError("Sem permissão.");
  return { creator, actor };
}

/** Encerra (`endsAt` agora) ou reabre (`null`) os cupons dela na Shopify. */
async function setCouponsEnd(prisma: PrismaClient, brandId: string, coupons: { code: string; shopifyId: string | null }[], endsAt: Date | null, clientFor: ClientFactory) {
  if (coupons.length === 0) return;
  try {
    const client = await clientFor(prisma, brandId);
    for (const c of coupons) {
      let id = c.shopifyId?.startsWith("gid://shopify/DiscountCodeNode/") ? c.shopifyId : null;
      if (!id) id = (await client.graphql<ByCode>(DISCOUNT_BY_CODE_QUERY, { code: c.code })).codeDiscountNodeByCode?.id ?? null;
      if (!id) continue; // não existe mais na loja: nada a encerrar
      const res = await client.graphql<UpdateResult>(DISCOUNT_UPDATE_MUTATION, {
        id,
        input: { endsAt: endsAt?.toISOString() ?? null, combinesWith: { orderDiscounts: true, productDiscounts: true, shippingDiscounts: true } },
      });
      const { codeDiscountNode, userErrors } = res.discountCodeBasicUpdate;
      if (userErrors.length || !codeDiscountNode) throw new ArchiveError(`A Shopify recusou o cupom ${c.code}: ${userErrors.map((e) => e.message).join("; ") || "sem resposta"}`);
    }
  } catch (error) {
    if (error instanceof ArchiveError) throw error;
    if (error instanceof ShopifyError) throw new ArchiveError(`${error.message} Nada foi mudado.`);
    if (error instanceof Error && /sem Shopify conectado/.test(error.message)) throw new ArchiveError("A loja Shopify desta marca não está conectada.");
    throw error;
  }
}

export async function archiveCreator(prisma: PrismaClient, actor: Actor | null, creatorId: string, clientFor: ClientFactory = defaultClientFactory, now = new Date()) {
  const { creator, actor: a } = await load(prisma, actor, creatorId);
  if (creator.archivedAt) return;
  const coupons = creator.couponAssignments.map((x) => x.coupon);
  await setCouponsEnd(prisma, creator.brandId, coupons, now, clientFor);
  await prisma.$transaction([
    prisma.creator.update({ where: { id: creatorId }, data: { archivedAt: now, archivedById: a.userId, status: "DEACTIVATED", deactivatedAt: now } }),
    prisma.coupon.updateMany({ where: { id: { in: coupons.map((c) => c.id) } }, data: { active: false } }),
    prisma.auditLog.create({
      data: { brandId: creator.brandId, actorType: "USER", actorId: a.userId, action: "creator.archive", entity: "Creator", entityId: creatorId, before: { status: creator.status }, after: { archived: true, coupons: coupons.map((c) => c.code) } },
    }),
  ]);
}

export async function unarchiveCreator(prisma: PrismaClient, actor: Actor | null, creatorId: string, clientFor: ClientFactory = defaultClientFactory) {
  const { creator, actor: a } = await load(prisma, actor, creatorId);
  if (!creator.archivedAt) return;
  const coupons = creator.couponAssignments.map((x) => x.coupon);
  await setCouponsEnd(prisma, creator.brandId, coupons, null, clientFor);
  await prisma.$transaction([
    prisma.creator.update({ where: { id: creatorId }, data: { archivedAt: null, archivedById: null, status: "INACTIVE", deactivatedAt: null } }),
    prisma.coupon.updateMany({ where: { id: { in: coupons.map((c) => c.id) } }, data: { active: true } }),
    prisma.auditLog.create({
      data: { brandId: creator.brandId, actorType: "USER", actorId: a.userId, action: "creator.unarchive", entity: "Creator", entityId: creatorId, after: { archived: false, status: "INACTIVE" } },
    }),
  ]);
}
