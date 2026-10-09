import type { PrismaClient } from "@/generated/prisma/client";
import type { Actor } from "@/lib/auth/actor";
import { brandsWith, can } from "@/lib/auth/permissions";
import type { PortalContext } from "@/lib/portal/context";
import { addressColumns, addressOf, normalizeAddress, type Address, type AddressInput } from "./address";

/**
 * Envios de produtos à creator (E7.8, D-SHIPMENTS). A equipe com `shipping.manage` (Envio, Gestão, super admin)
 * registra o envio com produtos da loja; o endereço é copiado da ficha no momento do registro. Situações:
 * Preparando → Enviado (transportadora + rastreio) → Entregue (equipe ou a própria creator, "Recebi"); cancelar é
 * possível antes da entrega. Toda mudança só acontece a partir da situação esperada (à prova de dois cliques) e vai
 * para a auditoria. Nada é apagado.
 */

export class ShipmentError extends Error {}

export const SHIPMENT_STATUS_LABEL = { PREPARING: "Preparando", SHIPPED: "Enviado", DELIVERED: "Entregue", CANCELLED: "Cancelado" } as const;
export type ShipmentStatusValue = keyof typeof SHIPMENT_STATUS_LABEL;

/** Link público de rastreio (Correios) quando o código tem o formato deles; outras transportadoras: só o código. */
export function trackingUrl(carrier: string | null, code: string | null): string | null {
  if (!code) return null;
  const c = code.trim().toUpperCase();
  if (/^[A-Z]{2}\d{9}[A-Z]{2}$/.test(c) && (!carrier || /correios/i.test(carrier))) return `https://rastreamento.correios.com.br/app/index.php?objeto=${c}`;
  return null;
}

function audit(prisma: PrismaClient | Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0], brandId: string, actorId: string, action: string, entityId: string, after: object) {
  return prisma.auditLog.create({ data: { brandId, actorType: "USER", actorId, action, entity: "Shipment", entityId, after } });
}

function assertManage(actor: Actor | null, brandId: string): asserts actor is Actor {
  if (!actor || !can(actor.grants, "shipping.manage", brandId)) throw new ShipmentError("Sem permissão para envios.");
}

// ───── Endereço (portal) ─────

export async function updateMyAddress(prisma: PrismaClient, ctx: PortalContext, actorUserId: string, input: AddressInput): Promise<Address> {
  if (ctx.viewAs) throw new ShipmentError("Visualização da equipe: nada é alterado em nome da creator.");
  const address = normalizeAddress(input);
  const creator = await prisma.creator.findUniqueOrThrow({ where: { id: ctx.creatorId }, select: { accountId: true, brandId: true } });
  await prisma.$transaction([
    prisma.creatorAccount.update({ where: { id: creator.accountId }, data: addressColumns(address) }),
    prisma.auditLog.create({
      data: { brandId: creator.brandId, actorType: "USER", actorId: actorUserId, action: "creator.address", entity: "CreatorAccount", entityId: creator.accountId, after: { city: address.city, state: address.state } },
    }),
  ]);
  return address;
}

// ───── Equipe ─────

export async function createShipment(
  prisma: PrismaClient,
  actor: Actor | null,
  input: { creatorId: string; items: { productId: string; quantity: number }[]; note?: string },
): Promise<string> {
  const creator = await prisma.creator.findUnique({ where: { id: input.creatorId }, include: { account: true } });
  if (!creator) throw new ShipmentError("Creator não encontrada.");
  assertManage(actor, creator.brandId);
  if (creator.status === "DEACTIVATED") throw new ShipmentError("Creator desligada não recebe envio.");
  const address = addressOf(creator.account);
  if (!address) throw new ShipmentError("A creator ainda não cadastrou o endereço completo no portal.");
  const items = input.items.filter((i) => i.quantity > 0);
  if (items.length === 0) throw new ShipmentError("Escolha ao menos um produto.");
  if (items.some((i) => !Number.isInteger(i.quantity) || i.quantity > 99)) throw new ShipmentError("Quantidade inválida.");
  const products = await prisma.product.findMany({ where: { id: { in: items.map((i) => i.productId) }, brandId: creator.brandId } });
  if (products.length !== new Set(items.map((i) => i.productId)).size) throw new ShipmentError("Produto não encontrado nesta marca.");
  const title = new Map(products.map((p) => [p.id, p.title]));

  return prisma.$transaction(async (tx) => {
    const shipment = await tx.shipment.create({
      data: {
        brandId: creator.brandId,
        creatorId: creator.id,
        note: input.note?.trim().slice(0, 500) || null,
        address,
        createdById: actor.userId,
        items: { create: items.map((i) => ({ productId: i.productId, title: title.get(i.productId)!, quantity: i.quantity })) },
      },
    });
    await audit(tx, creator.brandId, actor.userId, "shipment.create", shipment.id, { creatorId: creator.id, items: items.length });
    return shipment.id;
  });
}

async function transition(
  prisma: PrismaClient,
  shipmentId: string,
  from: ShipmentStatusValue[],
  data: Record<string, unknown>,
  check: (brandId: string, creatorId: string) => void,
  auditAs: { actorId: string; action: string; after: object },
) {
  const s = await prisma.shipment.findUnique({ where: { id: shipmentId }, select: { brandId: true, creatorId: true, status: true } });
  if (!s) throw new ShipmentError("Envio não encontrado.");
  check(s.brandId, s.creatorId);
  await prisma.$transaction(async (tx) => {
    const { count } = await tx.shipment.updateMany({ where: { id: shipmentId, status: { in: from } }, data });
    if (count === 0) throw new ShipmentError("Este envio mudou de situação. Atualize a página.");
    await audit(tx, s.brandId, auditAs.actorId, auditAs.action, shipmentId, auditAs.after);
  });
}

export async function markShipped(prisma: PrismaClient, actor: Actor | null, input: { shipmentId: string; carrier: string; trackingCode: string }, now = new Date()) {
  const carrier = input.carrier.trim().slice(0, 60) || "Correios";
  const trackingCode = input.trackingCode.trim().toUpperCase().slice(0, 60);
  if (!trackingCode) throw new ShipmentError("Informe o código de rastreio.");
  await transition(
    prisma,
    input.shipmentId,
    ["PREPARING"],
    { status: "SHIPPED", carrier, trackingCode, shippedAt: now, shippedById: actor?.userId },
    (brandId) => assertManage(actor, brandId),
    { actorId: actor?.userId ?? "", action: "shipment.shipped", after: { carrier, trackingCode } },
  );
}

export async function markDeliveredByStaff(prisma: PrismaClient, actor: Actor | null, shipmentId: string, now = new Date()) {
  await transition(
    prisma,
    shipmentId,
    ["SHIPPED"],
    { status: "DELIVERED", deliveredAt: now, deliveredBy: "STAFF", deliveredById: actor?.userId },
    (brandId) => assertManage(actor, brandId),
    { actorId: actor?.userId ?? "", action: "shipment.delivered", after: { by: "STAFF" } },
  );
}

export async function confirmReceived(prisma: PrismaClient, ctx: PortalContext, actorUserId: string, shipmentId: string, now = new Date()) {
  if (ctx.viewAs) throw new ShipmentError("Visualização da equipe: nada é confirmado em nome da creator.");
  await transition(
    prisma,
    shipmentId,
    ["SHIPPED"],
    { status: "DELIVERED", deliveredAt: now, deliveredBy: "CREATOR", deliveredById: actorUserId },
    (_brandId, creatorId) => {
      if (creatorId !== ctx.creatorId) throw new ShipmentError("Envio não encontrado.");
    },
    { actorId: actorUserId, action: "shipment.delivered", after: { by: "CREATOR" } },
  );
}

export async function cancelShipment(prisma: PrismaClient, actor: Actor | null, shipmentId: string, now = new Date()) {
  await transition(
    prisma,
    shipmentId,
    ["PREPARING", "SHIPPED"],
    { status: "CANCELLED", cancelledAt: now, cancelledById: actor?.userId },
    (brandId) => assertManage(actor, brandId),
    { actorId: actor?.userId ?? "", action: "shipment.cancelled", after: {} },
  );
}

// ───── Leitura ─────

const SHIPMENT_SELECT = {
  id: true,
  status: true,
  note: true,
  address: true,
  carrier: true,
  trackingCode: true,
  createdAt: true,
  shippedAt: true,
  deliveredAt: true,
  deliveredBy: true,
  cancelledAt: true,
  items: { select: { title: true, quantity: true }, orderBy: { title: "asc" as const } },
} as const;

export async function myShipments(prisma: PrismaClient, ctx: PortalContext) {
  return prisma.shipment.findMany({ where: { creatorId: ctx.creatorId, brandId: ctx.brand.id }, orderBy: { createdAt: "desc" }, select: SHIPMENT_SELECT });
}

export async function staffShipments(prisma: PrismaClient, actor: Actor | null, opts: { status?: ShipmentStatusValue } = {}) {
  if (!actor) throw new ShipmentError("Sem permissão para envios.");
  const brands = brandsWith(actor.grants, "shipping.view");
  if (brands !== "ALL" && brands.length === 0) throw new ShipmentError("Sem permissão para envios.");
  return prisma.shipment.findMany({
    where: { ...(brands === "ALL" ? {} : { brandId: { in: brands } }), ...(opts.status ? { status: opts.status } : {}) },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: { ...SHIPMENT_SELECT, brandId: true, creator: { select: { id: true, account: { select: { name: true } } } } },
  });
}

/** Creators que podem receber envio (com endereço ou não) e produtos ativos, para o formulário da equipe. */
export async function shipmentFormData(prisma: PrismaClient, actor: Actor | null) {
  if (!actor) throw new ShipmentError("Sem permissão para envios.");
  const brands = brandsWith(actor.grants, "shipping.manage");
  if (brands !== "ALL" && brands.length === 0) throw new ShipmentError("Sem permissão para envios.");
  const where = brands === "ALL" ? {} : { brandId: { in: brands } };
  const [creators, products] = await Promise.all([
    prisma.creator.findMany({
      where: { ...where, status: { not: "DEACTIVATED" } },
      orderBy: { account: { name: "asc" } },
      select: { id: true, brandId: true, account: { select: { name: true, addrZip: true, addrStreet: true, addrNumber: true, addrComplement: true, addrDistrict: true, addrCity: true, addrState: true } } },
    }),
    prisma.product.findMany({ where: { ...where, active: true }, orderBy: { title: "asc" }, select: { id: true, brandId: true, title: true } }),
  ]);
  return {
    creators: creators.map((c) => ({ id: c.id, brandId: c.brandId, name: c.account.name, hasAddress: addressOf(c.account) !== null })),
    products,
  };
}

/** Endereço atual da creator na ficha (null se ainda não cadastrou tudo). */
export async function myAddress(prisma: PrismaClient, ctx: PortalContext): Promise<Address | null> {
  const creator = await prisma.creator.findUniqueOrThrow({
    where: { id: ctx.creatorId },
    select: { account: { select: { addrZip: true, addrStreet: true, addrNumber: true, addrComplement: true, addrDistrict: true, addrCity: true, addrState: true } } },
  });
  return addressOf(creator.account);
}
