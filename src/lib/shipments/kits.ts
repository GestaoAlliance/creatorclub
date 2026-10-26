import type { PrismaClient } from "@/generated/prisma/client";
import { kitNoun, PRODUCT_REQUEST_MAX, validateKitChoice, validateProductRequest } from "@/domain";
import type { PortalContext } from "@/lib/portal/context";
import type { Actor } from "@/lib/auth/actor";
import { can } from "@/lib/auth/permissions";
import { addressOf } from "./address";
import { ShipmentError } from "./shipments";

/**
 * Kit mensal (D-KIT) e kit de boas-vindas do contrato (D-WELCOMEKIT, ao assinar), escolhidos do mesmo jeito.
 * Kit mensal: O fechamento do mês concede o kit (`KitGrant` PENDING) pela faixa de vendas do contrato; a
 * creator escolhe os produtos no portal (aba Envios) e o envio nasce "Preparando" com o endereço da ficha. Sem prazo:
 * o kit espera até ela escolher. A escolha só acontece a partir de PENDING (à prova de dois cliques).
 * D-KITAPPROVAL: a escolha vira um pedido "Aguardando aprovação"; a Gestão aprova (vai para o Envio, "Preparando") ou
 * recusa com motivo (o envio fica cancelado e o kit volta para ela escolher de novo).
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
    orderBy: [{ kind: "desc" }, { month: "asc" }], // boas-vindas primeiro
    select: { id: true, kind: true, month: true, products: true, salesCents: true },
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
  const kit = await prisma.kitGrant.findUnique({ where: { id: kitId }, select: { creatorId: true, brandId: true, kind: true, month: true, products: true, status: true } });
  if (!kit || kit.creatorId !== ctx.creatorId) throw new ShipmentError("Kit não encontrado.");
  if (kit.status !== "PENDING") throw new ShipmentError("Este kit já foi escolhido. Atualize a página.");
  let chosen: { productId: string; quantity: number }[];
  try {
    chosen = validateKitChoice(items, kit.products, ctx.brand.slug);
  } catch (e) {
    throw new ShipmentError((e as Error).message);
  }
  const creator = await prisma.creator.findUniqueOrThrow({ where: { id: ctx.creatorId }, include: { account: true } });
  if (creator.status === "DEACTIVATED") throw new ShipmentError("Creator desligada não recebe envio.");
  const address = addressOf(creator.account);
  if (!address) throw new ShipmentError("Cadastre o endereço de entrega antes de escolher o kit.");
  const products = await prisma.product.findMany({ where: { id: { in: chosen.map((i) => i.productId) }, brandId: kit.brandId, active: true } });
  if (products.length !== chosen.length) throw new ShipmentError("Produto indisponível. Atualize a página.");
  const title = new Map(products.map((p) => [p.id, p.title]));
  const now = new Date();

  return prisma.$transaction(async (tx) => {
    const shipment = await tx.shipment.create({
      data: {
        brandId: kit.brandId,
        creatorId: ctx.creatorId,
        status: "AWAITING_APPROVAL",
        note: `${kit.kind === "WELCOME" ? "Kit de boas-vindas" : `Kit mensal — vendas de ${monthLabel(kit.month)}`} (${kit.products} ${kitNoun(ctx.brand.slug, kit.products)})`,
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


/** Pedido esperando aprovação, conferido para quem decide (Gestão da marca, `creators.edit`). */
async function awaiting(prisma: PrismaClient, actor: Actor | null, shipmentId: string) {
  const s = await prisma.shipment.findUnique({ where: { id: shipmentId }, select: { brandId: true, creatorId: true, status: true } });
  if (!s) throw new ShipmentError("Pedido não encontrado.");
  if (!actor || !can(actor.grants, "creators.edit", s.brandId)) throw new ShipmentError("Só a Gestão aprova pedidos.");
  if (s.status !== "AWAITING_APPROVAL") throw new ShipmentError("Este pedido já foi decidido. Atualize a página.");
  return s;
}

/** D-KITAPPROVAL: aprovado vai para a fila do Envio ("Preparando"). */
export async function approveShipment(prisma: PrismaClient, actor: Actor | null, shipmentId: string, now = new Date()) {
  const s = await awaiting(prisma, actor, shipmentId);
  await prisma.$transaction(async (tx) => {
    const { count } = await tx.shipment.updateMany({ where: { id: shipmentId, status: "AWAITING_APPROVAL" }, data: { status: "PREPARING", approvedAt: now, approvedById: actor!.userId } });
    if (count === 0) throw new ShipmentError("Este pedido já foi decidido. Atualize a página.");
    await tx.auditLog.create({ data: { brandId: s.brandId, actorType: "USER", actorId: actor!.userId, action: "shipment.approved", entity: "Shipment", entityId: shipmentId, after: {} } });
  });
}

/** D-KITAPPROVAL: recusado fica cancelado com o motivo, e o kit volta para a creator escolher de novo. */
export async function rejectShipment(prisma: PrismaClient, actor: Actor | null, shipmentId: string, reason: string, now = new Date()) {
  const s = await awaiting(prisma, actor, shipmentId);
  const why = reason.trim().replace(/\s+/g, " ").slice(0, 300);
  if (!why) throw new ShipmentError("Escreva o motivo: ela vê no portal.");
  await prisma.$transaction(async (tx) => {
    const { count } = await tx.shipment.updateMany({
      where: { id: shipmentId, status: "AWAITING_APPROVAL" },
      data: { status: "CANCELLED", cancelledAt: now, cancelledById: actor!.userId, rejectReason: why },
    });
    if (count === 0) throw new ShipmentError("Este pedido já foi decidido. Atualize a página.");
    await tx.kitGrant.updateMany({ where: { shipmentId }, data: { status: "PENDING", shipmentId: null, chosenAt: null } });
    await tx.auditLog.create({ data: { brandId: s.brandId, actorType: "USER", actorId: actor!.userId, action: "shipment.rejected", entity: "Shipment", entityId: shipmentId, after: { reason: why } } });
  });
}

export const PRODUCT_REQUEST_NOTE = "Pedido da creator";

/**
 * D-PRODUCTREQ (pedido do responsável em 2026-10-26): a creator pede produtos quando quiser, sem kit liberado (ex.:
 * para gravar conteúdo). Até 3 por pedido e um pedido esperando aprovação por vez; só creator ativa com contrato
 * assinado. Vira o mesmo "Aguardando aprovação" do kit: a Gestão aprova (vai para o Envio) ou recusa com motivo.
 */
export async function productRequestState(prisma: PrismaClient, ctx: PortalContext): Promise<{ allowed: true } | { allowed: false; reason: string }> {
  const creator = await prisma.creator.findUniqueOrThrow({ where: { id: ctx.creatorId }, select: { status: true, contractSigned: true } });
  if (creator.status !== "ACTIVE") return { allowed: false, reason: "Só creators ativas pedem produtos. Fale com a equipe." };
  if (creator.contractSigned !== true) return { allowed: false, reason: "Os pedidos abrem depois do contrato assinado. Se você já assinou, fale com a equipe." };
  const open = await prisma.shipment.findFirst({ where: { creatorId: ctx.creatorId, brandId: ctx.brand.id, status: "AWAITING_APPROVAL", kit: null }, select: { id: true } });
  if (open) return { allowed: false, reason: "Você já tem um pedido esperando a aprovação da equipe. Quando ele for decidido, dá para pedir de novo." };
  return { allowed: true };
}

export async function requestProducts(
  prisma: PrismaClient,
  ctx: PortalContext,
  actorUserId: string,
  items: { productId: string; quantity: number }[],
  reason: string,
  now = new Date(),
): Promise<string> {
  if (ctx.viewAs) throw new ShipmentError("Visualização da equipe: nada é pedido em nome da creator.");
  const state = await productRequestState(prisma, ctx);
  if (!state.allowed) throw new ShipmentError(state.reason);
  let chosen: { productId: string; quantity: number }[];
  try {
    chosen = validateProductRequest(items, ctx.brand.slug);
  } catch (e) {
    throw new ShipmentError((e as Error).message);
  }
  const account = (await prisma.creator.findUniqueOrThrow({ where: { id: ctx.creatorId }, include: { account: true } })).account;
  const address = addressOf(account);
  if (!address) throw new ShipmentError("Cadastre o endereço de entrega antes de pedir.");
  const products = await prisma.product.findMany({ where: { id: { in: chosen.map((i) => i.productId) }, brandId: ctx.brand.id, active: true } });
  if (products.length !== chosen.length) throw new ShipmentError("Produto indisponível. Atualize a página.");
  const title = new Map(products.map((p) => [p.id, p.title]));
  const why = reason.trim().replace(/\s+/g, " ").slice(0, 200);
  return prisma.$transaction(async (tx) => {
    const shipment = await tx.shipment.create({
      data: {
        brandId: ctx.brand.id,
        creatorId: ctx.creatorId,
        status: "AWAITING_APPROVAL",
        note: why ? `${PRODUCT_REQUEST_NOTE}: ${why}` : PRODUCT_REQUEST_NOTE,
        address,
        createdById: actorUserId,
        createdAt: now,
        items: { create: chosen.map((i) => ({ productId: i.productId, title: title.get(i.productId)!, quantity: i.quantity })) },
      },
    });
    await tx.auditLog.create({
      data: { brandId: ctx.brand.id, actorType: "USER", actorId: actorUserId, action: "shipment.request", entity: "Shipment", entityId: shipment.id, after: { items: chosen.length, max: PRODUCT_REQUEST_MAX } },
    });
    return shipment.id;
  });
}
