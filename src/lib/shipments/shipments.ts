import type { PrismaClient } from "@/generated/prisma/client";
import { lookupCnpj, type CnpjLookup } from "@/lib/cnpj/lookup";
import { cnpjAddressLine, mustShipToCnpj, notices, sameShipAddress, trackingUrl as trackingLink, type Notice } from "@/domain";
import { notify } from "@/lib/notifications/notify";
import type { Actor } from "@/lib/auth/actor";
import { brandsWith, can } from "@/lib/auth/permissions";
import type { PortalContext } from "@/lib/portal/context";
import { PICKER_SELECT, pickerDetail } from "@/lib/creators/picker";
import { addressColumns, addressOf, normalizeAddress, partialAddressText, type Address, type AddressInput } from "./address";

/**
 * Envios de produtos à creator (E7.8, D-SHIPMENTS). A equipe com `shipping.manage` (Envio, Gestão, super admin)
 * registra o envio com produtos da loja; o endereço é copiado da ficha no momento do registro. Situações:
 * Preparando → Enviado (transportadora + rastreio) → Entregue (equipe ou a própria creator, "Recebi"); cancelar é
 * possível antes da entrega. Toda mudança só acontece a partir da situação esperada (à prova de dois cliques) e vai
 * para a auditoria. Nada é apagado.
 */

export class ShipmentError extends Error {}

export const SHIPMENT_STATUS_LABEL = { AWAITING_APPROVAL: "Aguardando aprovação", PREPARING: "Preparando", SHIPPED: "Enviado", DELIVERED: "Entregue", CANCELLED: "Cancelado" } as const;
export type ShipmentStatusValue = keyof typeof SHIPMENT_STATUS_LABEL;

/** D-TRACKING: o link do rastreio mora no domínio (também vai no aviso de envio). */
export { trackingUrl } from "@/domain";

function audit(prisma: PrismaClient | Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0], brandId: string, actorId: string, action: string, entityId: string, after: object) {
  return prisma.auditLog.create({ data: { brandId, actorType: "USER", actorId, action, entity: "Shipment", entityId, after } });
}

function assertManage(actor: Actor | null, brandId: string): asserts actor is Actor {
  if (!actor || !can(actor.grants, "shipping.manage", brandId)) throw new ShipmentError("Sem permissão para envios.");
}

// ───── Endereço (portal) ─────

export async function updateMyAddress(prisma: PrismaClient, ctx: PortalContext, actorUserId: string, input: AddressInput, cnpjLookup: CnpjLookup = lookupCnpj): Promise<Address> {
  if (ctx.viewAs) throw new ShipmentError("Visualização da equipe: nada é alterado em nome da creator.");
  const address = normalizeAddress(input);
  const creator = await prisma.creator.findUniqueOrThrow({ where: { id: ctx.creatorId }, select: { accountId: true, brandId: true, account: { select: { cnpj: true, taxRegime: true } } } });
  // D-PJADDR: empresa que não é MEI recebe os produtos no endereço do CNPJ (Receita fora do ar: não trava).
  if (mustShipToCnpj(creator.account.cnpj, creator.account.taxRegime)) {
    const info = await cnpjLookup(creator.account.cnpj!);
    if (info !== "notfound" && info !== "unavailable" && !sameShipAddress(address, info.address))
      throw new ShipmentError(`Como o seu CNPJ não é MEI, os produtos vão para o endereço da empresa: ${cnpjAddressLine(info.address)}. Para outro endereço, fale com a equipe.`);
  }
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
  notice?: Notice,
) {
  const s = await prisma.shipment.findUnique({ where: { id: shipmentId }, select: { brandId: true, creatorId: true, status: true } });
  if (!s) throw new ShipmentError("Envio não encontrado.");
  check(s.brandId, s.creatorId);
  await prisma.$transaction(async (tx) => {
    const { count } = await tx.shipment.updateMany({ where: { id: shipmentId, status: { in: from } }, data });
    if (count === 0) throw new ShipmentError("Este envio mudou de situação. Atualize a página.");
    await audit(tx, s.brandId, auditAs.actorId, auditAs.action, shipmentId, auditAs.after);
    if (notice) await notify(tx, [{ brandId: s.brandId, creatorId: s.creatorId, notice }]);
  });
}

/** Frete digitado ao marcar como enviado (M3.2, D-COST): "23,90" → 2390; vazio → null. */
export function freightToCents(raw: string | undefined): number | null {
  const s = (raw ?? "").replace(/R\$|\s/g, "");
  if (!s) return null;
  if (!/^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+(,\d{1,2})?$/.test(s)) throw new ShipmentError("Frete inválido. Use, por exemplo, 23,90 (ou deixe em branco).");
  const [int, dec = ""] = s.replace(/\./g, "").split(",");
  return Number(int) * 100 + Number(dec.padEnd(2, "0"));
}

export async function markShipped(
  prisma: PrismaClient,
  actor: Actor | null,
  input: { shipmentId: string; carrier: string; trackingCode: string; freight?: string },
  now = new Date(),
) {
  const carrier = input.carrier.trim().slice(0, 60) || "Correios";
  const trackingCode = input.trackingCode.trim().toUpperCase().slice(0, 60);
  if (!trackingCode) throw new ShipmentError("Informe o código de rastreio.");
  const freightCents = freightToCents(input.freight);
  // D-TRACKING: o aviso lista o que foi e leva o link do rastreio.
  const items = await prisma.shipmentItem.findMany({ where: { shipmentId: input.shipmentId }, orderBy: { title: "asc" }, select: { title: true, quantity: true } });
  await transition(
    prisma,
    input.shipmentId,
    ["PREPARING"],
    { status: "SHIPPED", carrier, trackingCode, shippedAt: now, shippedById: actor?.userId, freightCents },
    (brandId) => assertManage(actor, brandId),
    { actorId: actor?.userId ?? "", action: "shipment.shipped", after: { carrier, trackingCode, freightCents } },
    notices.shipped(input.shipmentId, carrier, trackingCode, items, trackingLink(carrier, trackingCode)),
  );
}

export async function markDeliveredByStaff(prisma: PrismaClient, actor: Actor | null, shipmentId: string, now = new Date()) {
  // D-TRACKING: "seus produtos chegaram" com o cupom dela.
  const s = await prisma.shipment.findUnique({
    where: { id: shipmentId },
    select: { creator: { select: { couponAssignments: { where: { validTo: null, coupon: { kind: "CREATOR" } }, orderBy: { validFrom: "desc" }, take: 1, select: { coupon: { select: { code: true } } } } } } },
  });
  await transition(
    prisma,
    shipmentId,
    ["SHIPPED"],
    { status: "DELIVERED", deliveredAt: now, deliveredBy: "STAFF", deliveredById: actor?.userId },
    (brandId) => assertManage(actor, brandId),
    { actorId: actor?.userId ?? "", action: "shipment.delivered", after: { by: "STAFF" } },
    notices.delivered(shipmentId, s?.creator.couponAssignments[0]?.coupon.code ?? null),
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
  approvedAt: true,
  rejectReason: true,
  items: { select: { title: true, quantity: true }, orderBy: { title: "asc" as const } },
  // D-SHOPTAB: etiqueta "Loja" ou "Prêmio" nos envios da creator.
  balanceCents: true,
  kit: { select: { kind: true } },
} as const;

export async function myShipments(prisma: PrismaClient, ctx: PortalContext) {
  return prisma.shipment.findMany({ where: { creatorId: ctx.creatorId, brandId: ctx.brand.id }, orderBy: { createdAt: "desc" }, select: SHIPMENT_SELECT });
}

export async function staffShipments(prisma: PrismaClient, actor: Actor | null, opts: { status?: ShipmentStatusValue; staleBefore?: Date } = {}) {
  if (!actor) throw new ShipmentError("Sem permissão para envios.");
  const brands = brandsWith(actor.grants, "shipping.view");
  if (brands !== "ALL" && brands.length === 0) throw new ShipmentError("Sem permissão para envios.");
  return prisma.shipment.findMany({
    // D-TRACKING: `staleBefore` = enviados antes da data e ainda sem "Recebi" (possível extravio).
    where: { ...(brands === "ALL" ? {} : { brandId: { in: brands } }), ...(opts.status ? { status: opts.status } : {}), ...(opts.staleBefore ? { status: "SHIPPED" as const, shippedAt: { lte: opts.staleBefore } } : {}) },
    orderBy: { createdAt: "desc" },
    take: 200,
    // M4.3 (D-PROFILEFIELDS): alergias e restrições aparecem para quem monta o envio.
    // D-SHIPRECIPIENT: CPF, CNPJ, telefone e e-mail para quem monta o envio (a tela só mostra com `personal.address`).
    select: { ...SHIPMENT_SELECT, brandId: true, creator: { select: { id: true, account: { select: { name: true, allergies: true, cpf: true, cnpj: true, phone: true, email: true } } } } },
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
      select: {
        id: true,
        brandId: true,
        couponAssignments: PICKER_SELECT.couponAssignments,
        account: { select: { name: true, email: true, instagram: true, addrZip: true, addrStreet: true, addrNumber: true, addrComplement: true, addrDistrict: true, addrCity: true, addrState: true } },
      },
    }),
    prisma.product.findMany({ where: { ...where, active: true }, orderBy: { title: "asc" }, select: { id: true, brandId: true, title: true } }),
  ]);
  return {
    creators: creators.map((c) => ({ id: c.id, brandId: c.brandId, name: c.account.name, detail: pickerDetail(c), hasAddress: addressOf(c.account) !== null })),
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

/**
 * Endereço que já existe em texto livre, para ajudar a cadastrar o endereço de entrega em campos quando ainda não há
 * (U2, D-ADDRINFORMED). Ordem: contrato assinado, inscrição, endereço incompleto da conta (carga das planilhas), último
 * envio importado. Só leitura; nada é copiado sozinho.
 */
export async function informedAddressFor(prisma: PrismaClient, creatorId: string): Promise<string | null> {
  const sig = await prisma.contractSignature.findFirst({ where: { creatorId }, orderBy: { signedAt: "desc" }, select: { address: true } });
  if (sig?.address?.trim()) return sig.address.trim();
  const app = await prisma.creatorApplication.findFirst({ where: { creatorId }, orderBy: { submittedAt: "desc" }, select: { address: true } });
  const fromApp = app?.address?.trim().replace(/\s*\n+\s*/g, ", ");
  if (fromApp) return fromApp;
  const creator = await prisma.creator.findUniqueOrThrow({
    where: { id: creatorId },
    select: { account: { select: { addrZip: true, addrStreet: true, addrNumber: true, addrComplement: true, addrDistrict: true, addrCity: true, addrState: true } } },
  });
  const partial = partialAddressText(creator.account);
  if (partial) return partial;
  const shipment = await prisma.shipment.findFirst({ where: { creatorId }, orderBy: { createdAt: "desc" }, select: { address: true } });
  const raw = shipment?.address && typeof shipment.address === "object" && "raw" in shipment.address ? String((shipment.address as { raw: unknown }).raw ?? "").trim() : "";
  return raw || null;
}

export async function informedAddress(prisma: PrismaClient, ctx: PortalContext): Promise<string | null> {
  return informedAddressFor(prisma, ctx.creatorId);
}
