import type { PrismaClient } from "@/generated/prisma/client";
import { validateKitChoice } from "@/domain";
import type { PortalContext } from "@/lib/portal/context";
import { addressOf } from "./address";
import { ShipmentError } from "./shipments";

/**
 * Kit mensal (D-KIT). O fechamento do mês concede o kit (`KitGrant` PENDING) pela faixa de vendas do contrato; a
 * creator escolhe os produtos no portal (aba Envios) e o envio nasce "Preparando" com o endereço da ficha. Sem prazo:
 * o kit espera até ela escolher. A escolha só acontece a partir de PENDING (à prova de dois cliques).
 */

const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

/** "2026-10" → "outubro de 2026". */
export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number) as [number, number];
  return `${MONTHS[m - 1]} de ${y}`;
}

/** Kits que a creator ainda precisa escolher, e os produtos ativos da marca para a escolha. */
export async function myPendingKits(prisma: PrismaClient, ctx: PortalContext) {
  const kits = await prisma.kitGrant.findMany({
    where: { creatorId: ctx.creatorId, brandId: ctx.brand.id, status: "PENDING" },
    orderBy: { month: "asc" },
    select: { id: true, month: true, products: true, salesCents: true },
  });
  const products = kits.length
    ? await prisma.product.findMany({ where: { brandId: ctx.brand.id, active: true }, orderBy: { title: "asc" }, select: { id: true, title: true } })
    : [];
  return { kits, products };
}

export async function chooseKit(
  prisma: PrismaClient,
  ctx: PortalContext,
  actorUserId: string,
  kitId: string,
  items: { productId: string; quantity: number }[],
): Promise<string> {
  if (ctx.viewAs) throw new ShipmentError("Visualização da equipe: nada é escolhido em nome da creator.");
  const kit = await prisma.kitGrant.findUnique({ where: { id: kitId }, select: { creatorId: true, brandId: true, month: true, products: true, status: true } });
  if (!kit || kit.creatorId !== ctx.creatorId) throw new ShipmentError("Kit não encontrado.");
  if (kit.status !== "PENDING") throw new ShipmentError("Este kit já foi escolhido. Atualize a página.");
  let chosen: { productId: string; quantity: number }[];
  try {
    chosen = validateKitChoice(items, kit.products);
  } catch (e) {
    throw new ShipmentError((e as Error).message);
  }
  const creator = await prisma.creator.findUniqueOrThrow({ where: { id: ctx.creatorId }, include: { account: true } });
  if (creator.status === "DEACTIVATED") throw new ShipmentError("Creator desligada não recebe envio.");
  const address = addressOf(creator.account);
  if (!address) throw new ShipmentError("Cadastre o endereço completo acima antes de escolher o kit.");
  const products = await prisma.product.findMany({ where: { id: { in: chosen.map((i) => i.productId) }, brandId: kit.brandId, active: true } });
  if (products.length !== chosen.length) throw new ShipmentError("Produto indisponível. Atualize a página.");
  const title = new Map(products.map((p) => [p.id, p.title]));
  const now = new Date();

  return prisma.$transaction(async (tx) => {
    const shipment = await tx.shipment.create({
      data: {
        brandId: kit.brandId,
        creatorId: ctx.creatorId,
        note: `Kit mensal — vendas de ${monthLabel(kit.month)} (${kit.products} ${kit.products === 1 ? "suplemento" : "suplementos"})`,
        address,
        createdById: actorUserId,
        items: { create: chosen.map((i) => ({ productId: i.productId, title: title.get(i.productId)!, quantity: i.quantity })) },
      },
    });
    const { count } = await tx.kitGrant.updateMany({ where: { id: kitId, status: "PENDING" }, data: { status: "CHOSEN", shipmentId: shipment.id, chosenAt: now } });
    if (count === 0) throw new ShipmentError("Este kit já foi escolhido. Atualize a página.");
    await tx.auditLog.create({
      data: { brandId: kit.brandId, actorType: "USER", actorId: actorUserId, action: "kit.choose", entity: "KitGrant", entityId: kitId, after: { shipmentId: shipment.id, items: chosen.length } },
    });
    return shipment.id;
  });
}

