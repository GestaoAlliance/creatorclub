import type { PrismaClient } from "@/generated/prisma/client";
import { creatorPriceCents, formatBRL, productPhoto, validateShopItems } from "@/domain";
import { creatorBalance } from "@/lib/commission/release";
import type { PortalContext } from "@/lib/portal/context";
import { addressOf } from "./address";
import { ShipmentError } from "./shipments";

/**
 * Loja com o saldo (M5.1, D-SHOPBALANCE; respostas do responsável em 2026-10-27): a creator ativa, com contrato
 * assinado, compra produtos ativos da marca com o saldo disponível (cada marca com o seu). Preço da loja menos o
 * desconto da marca, frete da marca, sem nota. A compra nasce "Aguardando aprovação" com o valor reservado no saldo;
 * a Gestão aprova (lança "Compra com o saldo" no extrato e vai para o Envio) ou recusa (a reserva some).
 */

export const SHOP_NOTE = "Compra com o saldo";

export type ShopProduct = { id: string; title: string; photo: string | null; priceCents: number; creatorPriceCents: number };
export type ShopState =
  | { allowed: true; availableCents: number; discountBps: number; products: ShopProduct[] }
  | { allowed: false; reason: string };

async function shopProducts(prisma: PrismaClient, brand: { id: string; slug: string }, discountBps: number): Promise<ShopProduct[]> {
  const rows = await prisma.product.findMany({ where: { brandId: brand.id, active: true, priceCents: { gt: 0 } }, orderBy: { title: "asc" }, select: { id: true, title: true, priceCents: true } });
  return rows.map((p) => ({ id: p.id, title: p.title, photo: productPhoto(brand.slug, p.title), priceCents: p.priceCents!, creatorPriceCents: creatorPriceCents(p.priceCents!, discountBps) }));
}

export async function myShop(prisma: PrismaClient, ctx: PortalContext, now = new Date()): Promise<ShopState> {
  const creator = await prisma.creator.findUniqueOrThrow({
    where: { id: ctx.creatorId },
    select: { id: true, brandId: true, status: true, contractSigned: true, brand: { select: { slug: true, timezone: true, shopDiscountBps: true } } },
  });
  if (creator.status !== "ACTIVE") return { allowed: false, reason: "A loja é para creators ativas. Fale com a equipe." };
  if (creator.contractSigned !== true) return { allowed: false, reason: "A loja abre depois do contrato assinado. Se você já assinou, fale com a equipe." };
  const balance = await creatorBalance(prisma, creator, creator.brand.timezone, now);
  const products = await shopProducts(prisma, { id: creator.brandId, slug: creator.brand.slug }, creator.brand.shopDiscountBps);
  return { allowed: true, availableCents: balance.availableCents, discountBps: creator.brand.shopDiscountBps, products };
}

export async function buyWithBalance(
  prisma: PrismaClient,
  ctx: PortalContext,
  actorUserId: string,
  items: { productId: string; quantity: number }[],
  now = new Date(),
): Promise<string> {
  if (ctx.viewAs) throw new ShipmentError("Visualização da equipe: nada é comprado em nome da creator.");
  let chosen: { productId: string; quantity: number }[];
  try {
    chosen = validateShopItems(items);
  } catch (e) {
    throw new ShipmentError((e as Error).message);
  }
  return prisma.$transaction(async (tx) => {
    // Trava a creator: duas compras ao mesmo tempo não usam o mesmo saldo.
    await tx.$queryRaw`SELECT id FROM "Creator" WHERE id = ${ctx.creatorId} FOR UPDATE`;
    const creator = await tx.creator.findUniqueOrThrow({
      where: { id: ctx.creatorId },
      select: { id: true, brandId: true, status: true, contractSigned: true, account: true, brand: { select: { slug: true, timezone: true, shopDiscountBps: true } } },
    });
    if (creator.status !== "ACTIVE" || creator.contractSigned !== true) throw new ShipmentError("A loja não está liberada para você. Fale com a equipe.");
    const address = addressOf(creator.account);
    if (!address) throw new ShipmentError("Cadastre o endereço de entrega antes de comprar.");
    const products = await shopProducts(tx as unknown as PrismaClient, { id: creator.brandId, slug: creator.brand.slug }, creator.brand.shopDiscountBps);
    const byId = new Map(products.map((p) => [p.id, p]));
    if (chosen.some((i) => !byId.has(i.productId))) throw new ShipmentError("Produto indisponível. Atualize a página.");
    const totalCents = chosen.reduce((s, i) => s + byId.get(i.productId)!.creatorPriceCents * i.quantity, 0);
    if (totalCents <= 0) throw new ShipmentError("Escolha pelo menos 1 produto.");
    const balance = await creatorBalance(tx, creator, creator.brand.timezone, now);
    if (balance.availableCents < totalCents) throw new ShipmentError(`Saldo disponível insuficiente: você tem ${formatBRL(Math.max(0, balance.availableCents))} e a compra dá ${formatBRL(totalCents)}.`);
    const shipment = await tx.shipment.create({
      data: {
        brandId: creator.brandId,
        creatorId: creator.id,
        status: "AWAITING_APPROVAL",
        note: `${SHOP_NOTE} (${formatBRL(totalCents)})`,
        balanceCents: totalCents,
        address,
        createdById: actorUserId,
        createdAt: now,
        items: { create: chosen.map((i) => ({ productId: i.productId, title: byId.get(i.productId)!.title, quantity: i.quantity })) },
      },
    });
    await tx.auditLog.create({
      data: { brandId: creator.brandId, actorType: "USER", actorId: actorUserId, action: "shop.buy", entity: "Shipment", entityId: shipment.id, after: { totalCents, items: chosen.length } },
    });
    return shipment.id;
  });
}
