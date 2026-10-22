import type { PrismaClient } from "@/generated/prisma/client";
import { assertBps } from "@/domain";
import type { Actor } from "@/lib/auth/actor";
import { can } from "@/lib/auth/permissions";
import { ShopifyError } from "@/lib/shopify/client";
import { defaultClientFactory, type ClientFactory } from "@/lib/shopify/jobs";
import { validCouponDiscount } from "./create";

/**
 * Muda o desconto que o cupom da creator dá às clientes (D-RATEDISCOUNT): a Shopify primeiro (só o valor, mantendo
 * os produtos a que o cupom vale, e combinável com pedido, produto e frete); só depois do OK grava no banco, com
 * auditoria. Cupom que veio do app antigo sem o id da Shopify é achado pelo código.
 */

export class DiscountChangeError extends Error {}

export const DISCOUNT_BY_CODE_QUERY = `query CouponByCode($code: String!) {
  codeDiscountNodeByCode(code: $code) {
    id
    codeDiscount { __typename }
  }
}`;

export const DISCOUNT_UPDATE_MUTATION = `mutation UpdateCreatorCoupon($id: ID!, $input: DiscountCodeBasicInput!) {
  discountCodeBasicUpdate(id: $id, basicCodeDiscount: $input) {
    codeDiscountNode { id }
    userErrors { field code message }
  }
}`;

type ByCode = { codeDiscountNodeByCode: { id: string; codeDiscount: { __typename: string } } | null };
type UpdateResult = { discountCodeBasicUpdate: { codeDiscountNode: { id: string } | null; userErrors: { message: string }[] } };

const isNodeId = (id: string | null): id is string => !!id && id.startsWith("gid://shopify/DiscountCodeNode/");

export async function changeCouponDiscount(
  prisma: PrismaClient,
  actor: Actor | null,
  input: { creatorId: string; discountBps: number },
  clientFor: ClientFactory = defaultClientFactory,
): Promise<{ code: string; changed: boolean }> {
  const creator = await prisma.creator.findUnique({ where: { id: input.creatorId }, select: { id: true, brandId: true, status: true } });
  if (!creator) throw new DiscountChangeError("Creator não encontrada.");
  if (!actor || !can(actor.grants, "creators.edit", creator.brandId)) throw new DiscountChangeError("Sem permissão.");
  if (creator.status === "DEACTIVATED") throw new DiscountChangeError("Creator desligada: o cupom não muda.");
  try {
    assertBps(input.discountBps);
  } catch {
    throw new DiscountChangeError("Desconto inválido.");
  }
  if (!validCouponDiscount(input.discountBps)) throw new DiscountChangeError("O desconto precisa ficar entre 0,01% e 50%.");
  const assignment = await prisma.couponAssignment.findFirst({
    where: { creatorId: creator.id, validTo: null, coupon: { kind: "CREATOR", active: true } },
    orderBy: { validFrom: "desc" },
    select: { coupon: { select: { id: true, code: true, shopifyId: true, discountBps: true } } },
  });
  if (!assignment) throw new DiscountChangeError("Ela não tem cupom de creator ativo.");
  const coupon = assignment.coupon;
  if (coupon.discountBps === input.discountBps) return { code: coupon.code, changed: false };

  let nodeId = isNodeId(coupon.shopifyId) ? coupon.shopifyId : null;
  try {
    const client = await clientFor(prisma, creator.brandId);
    if (!nodeId) {
      const found = await client.graphql<ByCode>(DISCOUNT_BY_CODE_QUERY, { code: coupon.code });
      if (!found.codeDiscountNodeByCode) throw new DiscountChangeError(`O cupom ${coupon.code} não foi encontrado na Shopify.`);
      if (found.codeDiscountNodeByCode.codeDiscount.__typename !== "DiscountCodeBasic")
        throw new DiscountChangeError(`O cupom ${coupon.code} não é de porcentagem na Shopify; mude por lá.`);
      nodeId = found.codeDiscountNodeByCode.id;
    }
    const res = await client.graphql<UpdateResult>(DISCOUNT_UPDATE_MUTATION, {
      id: nodeId,
      input: {
        customerGets: { value: { percentage: input.discountBps / 10_000 } },
        // Regra do projeto: todo cupom gravado na Shopify combina com descontos de pedido, produto e frete.
        combinesWith: { orderDiscounts: true, productDiscounts: true, shippingDiscounts: true },
      },
    });
    const { codeDiscountNode, userErrors } = res.discountCodeBasicUpdate;
    if (userErrors.length || !codeDiscountNode) throw new DiscountChangeError(`A Shopify recusou: ${userErrors.map((e) => e.message).join("; ") || "sem resposta"}`);
  } catch (error) {
    if (error instanceof DiscountChangeError) throw error;
    if (error instanceof ShopifyError && /403|permissão/i.test(error.message))
      throw new DiscountChangeError("O app da Shopify não tem permissão para mudar cupons (write_discounts). Libere no app e reconecte a loja.");
    if (error instanceof ShopifyError) throw new DiscountChangeError(error.message);
    if (error instanceof Error && /sem Shopify conectado/.test(error.message)) throw new DiscountChangeError("A loja Shopify desta marca não está conectada.");
    if (error instanceof Error) throw new DiscountChangeError(`Não consegui falar com a Shopify: ${error.message} Nada foi mudado.`);
    throw error;
  }

  await prisma.$transaction([
    prisma.coupon.update({ where: { id: coupon.id }, data: { discountBps: input.discountBps, shopifyId: nodeId } }),
    prisma.auditLog.create({
      data: {
        brandId: creator.brandId,
        actorType: "USER",
        actorId: actor.userId,
        action: "coupon.discount",
        entity: "Coupon",
        entityId: coupon.id,
        before: { discountBps: coupon.discountBps, shopifyId: coupon.shopifyId },
        after: { discountBps: input.discountBps, shopifyId: nodeId },
      },
    }),
  ]);
  return { code: coupon.code, changed: true };
}
