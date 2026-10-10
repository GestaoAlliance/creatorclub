import type { PrismaClient } from "@/generated/prisma/client";
import { assertBps, validateNewCouponCode } from "@/domain";
import type { Actor } from "@/lib/auth/actor";
import { can } from "@/lib/auth/permissions";
import { ShopifyError } from "@/lib/shopify/client";
import { defaultClientFactory, type ClientFactory } from "@/lib/shopify/jobs";

/**
 * Cupom criado pelo sistema na Shopify (D-COUPONCREATE), a partir da ficha da creator. Quem edita creators escolhe o
 * código (só letras, até 8) e o desconto; o sistema cria o cupom na Shopify (todos os produtos, qualquer cliente,
 * combinável com pedido, produto e frete) e, só depois do OK da Shopify, grava o cupom de creator já ligado a ela.
 * Contrato de permuta (UGC, sem comissão) sem taxa vigente ganha taxa 0%: as vendas aparecem, sem comissão.
 */

export class CouponCreateError extends Error {}

export const COUPON_CREATE_MUTATION = `mutation CreateCreatorCoupon($input: DiscountCodeBasicInput!) {
  discountCodeBasicCreate(basicCodeDiscount: $input) {
    codeDiscountNode { id }
    userErrors { field code message }
  }
}`;

type CreateResult = { discountCodeBasicCreate: { codeDiscountNode: { id: string } | null; userErrors: { field: string[] | null; code: string | null; message: string }[] } };

export function couponInput(code: string, discountBps: number, startsAt: Date) {
  return {
    title: `Creator Club — ${code}`,
    code,
    startsAt: startsAt.toISOString(),
    context: { all: "ALL" },
    customerGets: { value: { percentage: discountBps / 10_000 }, items: { all: true } },
    // Regra do projeto: todo cupom gravado na Shopify combina com descontos de pedido, produto e frete.
    combinesWith: { orderDiscounts: true, productDiscounts: true, shippingDiscounts: true },
  };
}

/**
 * Só a parte da Shopify: cria o desconto (regras de `couponInput`) e devolve o id. Erros viram mensagens para a equipe.
 * Usada pela ficha e pela aprovação de candidata (F3), que gravam o cupom no banco só depois do OK da Shopify.
 */
export async function createDiscountInShopify(
  prisma: PrismaClient,
  brandId: string,
  code: string,
  discountBps: number,
  clientFor: ClientFactory = defaultClientFactory,
  now = new Date(),
): Promise<string> {
  try {
    const client = await clientFor(prisma, brandId);
    const res = await client.graphql<CreateResult>(COUPON_CREATE_MUTATION, { input: couponInput(code, discountBps, now) });
    const { codeDiscountNode, userErrors } = res.discountCodeBasicCreate;
    if (userErrors.length || !codeDiscountNode) {
      const taken = userErrors.some((e) => /unique|taken|já/i.test(e.message));
      throw new CouponCreateError(taken ? `O cupom ${code} já existe na loja. Escolha outro.` : `A Shopify recusou: ${userErrors.map((e) => e.message).join("; ")}`);
    }
    return codeDiscountNode.id;
  } catch (error) {
    if (error instanceof CouponCreateError) throw error;
    if (error instanceof ShopifyError && /403|permissão/i.test(error.message))
      throw new CouponCreateError("O app da Shopify ainda não tem permissão para criar cupons (write_discounts). Libere no app e reconecte a loja.");
    if (error instanceof ShopifyError) throw new CouponCreateError(error.message);
    if (error instanceof Error && /sem Shopify conectado/.test(error.message)) throw new CouponCreateError("A loja Shopify desta marca não está conectada.");
    throw error;
  }
}

/** Desconto que a Shopify aceita para cupom de creator: de 0,01% a 50%. */
export const validCouponDiscount = (bps: number) => Number.isInteger(bps) && bps > 0 && bps <= 5000;

export async function createCouponInShopify(
  prisma: PrismaClient,
  actor: Actor | null,
  input: { creatorId: string; code: string; discountBps: number },
  clientFor: ClientFactory = defaultClientFactory,
  now = new Date(),
): Promise<{ couponId: string; code: string }> {
  const creator = await prisma.creator.findUnique({
    where: { id: input.creatorId },
    select: {
      id: true,
      brandId: true,
      status: true,
      contractTemplate: { select: { releaseMinCents: true } },
      commissionPolicies: { where: { OR: [{ validTo: null }, { validTo: { gt: now } }], validFrom: { lte: now } }, select: { id: true }, take: 1 },
    },
  });
  if (!creator) throw new CouponCreateError("Creator não encontrada.");
  if (!actor || !can(actor.grants, "creators.edit", creator.brandId)) throw new CouponCreateError("Sem permissão.");
  if (creator.status === "DEACTIVATED") throw new CouponCreateError("Creator desligada não ganha cupom.");
  const v = validateNewCouponCode(input.code);
  if (!v.ok) throw new CouponCreateError("Cupom inválido: só letras, até 8.");
  try {
    assertBps(input.discountBps);
  } catch {
    throw new CouponCreateError("Desconto inválido.");
  }
  if (!validCouponDiscount(input.discountBps)) throw new CouponCreateError("O desconto precisa ficar entre 0,01% e 50%.");
  const permuta = creator.contractTemplate !== null && creator.contractTemplate.releaseMinCents === null;
  if (creator.commissionPolicies.length === 0 && !permuta) throw new CouponCreateError("Defina a taxa de comissão da creator antes de criar o cupom.");
  if (await prisma.coupon.findUnique({ where: { brandId_code: { brandId: creator.brandId, code: v.code } }, select: { id: true } }))
    throw new CouponCreateError(`O cupom ${v.code} já existe nesta marca. Escolha outro.`);

  const shopifyId = await createDiscountInShopify(prisma, creator.brandId, v.code, input.discountBps, clientFor, now);

  return prisma.$transaction(async (tx) => {
    const coupon = await tx.coupon.create({
      data: { brandId: creator.brandId, code: v.code, kind: "CREATOR", classifiedAt: now, classifiedById: actor.userId, discountBps: input.discountBps, shopifyId },
    });
    await tx.couponAssignment.create({
      data: { brandId: creator.brandId, couponId: coupon.id, creatorId: creator.id, validFrom: now, createdById: actor.userId, confirmedAt: now, confirmedById: actor.userId },
    });
    if (creator.commissionPolicies.length === 0)
      await tx.commissionPolicy.create({
        data: { brandId: creator.brandId, creatorId: creator.id, rateBps: 0, validFrom: now, createdById: actor.userId, confirmedAt: now, confirmedById: actor.userId },
      });
    await tx.auditLog.create({
      data: {
        brandId: creator.brandId,
        actorType: "USER",
        actorId: actor.userId,
        action: "coupon.created_in_shopify",
        entity: "Coupon",
        entityId: coupon.id,
        after: { code: v.code, discountBps: input.discountBps, shopifyId, creatorId: creator.id, zeroRate: creator.commissionPolicies.length === 0 },
      },
    });
    return { couponId: coupon.id, code: v.code };
  });
}
