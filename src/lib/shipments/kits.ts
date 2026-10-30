import type { PrismaClient } from "@/generated/prisma/client";
import { addDaysKey, dayKey, GOAL_SALES_CENTS, goalWindowsUntil, isTierTrialMonth, kitNoun, monthKey, nextTier, productPhoto, startOfLocalDay, tierProducts, validateKitChoice } from "@/domain";
import { salesByMonth } from "@/lib/commission/release";
import type { PortalContext } from "@/lib/portal/context";
import type { Actor } from "@/lib/auth/actor";
import { can } from "@/lib/auth/permissions";
import { addressOf } from "./address";
import { ShipmentError } from "./shipments";

/**
 * Kit mensal (D-KIT) e kit de boas-vindas do contrato (D-WELCOMEKIT, ao assinar), escolhidos do mesmo jeito.
 * Kit mensal: O fechamento do mês concede o kit (`KitGrant` PENDING) pela faixa de vendas do contrato; a
 * creator escolhe os produtos no portal (aba Pedidos) e o envio nasce "Preparando" com o endereço da ficha. Sem prazo:
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

/**
 * D-KITOPTIONS (pedido da Vanessa em 2026-10-26): produtos que a creator pode escolher, marcados por marca em Marcas
 * (ex.: Revita só o Pepti Code). Marca sem nenhum marcado: todos os ativos.
 */
export async function kitProducts(prisma: PrismaClient, brandId: string) {
  const all = await prisma.product.findMany({
    where: { brandId, active: true },
    orderBy: { title: "asc" },
    select: { id: true, title: true, kitOption: true, stockQty: true, brand: { select: { slug: true } } },
  });
  const marked = all.filter((p) => p.kitOption);
  // D-OLIST: zerado no Olist fica "sem estoque" (não dá para escolher); sem leitura do Olist, segue disponível.
  return (marked.length ? marked : all).map(({ id, title, brand, stockQty }) => ({ id, title, photo: productPhoto(brand.slug, title), outOfStock: stockQty !== null && stockQty <= 0 }));
}

/**
 * D-WELCOMECHOICE: os produtos já definidos do kit (1º pedido pela opção do cadastro). Algum fora da loja (inativo ou de
 * outra marca): null, e ela escolhe como nos outros kits.
 */
async function presetProducts(prisma: PrismaClient, brandId: string, ids: readonly string[]) {
  if (ids.length === 0) return null;
  const rows = await prisma.product.findMany({ where: { brandId, active: true, id: { in: [...ids] } }, select: { id: true, title: true, stockQty: true, brand: { select: { slug: true } } } });
  if (rows.length !== new Set(ids).size) return null;
  return rows.map(({ id, title, brand, stockQty }) => ({ id, title, photo: productPhoto(brand.slug, title), outOfStock: stockQty !== null && stockQty <= 0 }));
}

/** Kits que a creator ainda precisa escolher, e os produtos que ela pode escolher. */
export async function myPendingKits(prisma: PrismaClient, ctx: PortalContext) {
  const rows = await prisma.kitGrant.findMany({
    where: { creatorId: ctx.creatorId, brandId: ctx.brand.id, status: "PENDING" },
    orderBy: [{ kind: "desc" }, { month: "asc" }], // boas-vindas primeiro
    select: { id: true, kind: true, month: true, products: true, salesCents: true, presetProductIds: true },
  });
  const kits = await Promise.all(rows.map(async ({ presetProductIds, ...k }) => ({ ...k, preset: await presetProducts(prisma, ctx.brand.id, presetProductIds) })));
  const products = kits.length ? await kitProducts(prisma, ctx.brand.id) : [];
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
  const kit = await prisma.kitGrant.findUnique({ where: { id: kitId }, select: { creatorId: true, brandId: true, kind: true, month: true, products: true, status: true, presetProductIds: true } });
  if (!kit || kit.creatorId !== ctx.creatorId) throw new ShipmentError("Kit não encontrado.");
  if (kit.status !== "PENDING") throw new ShipmentError("Este kit já foi escolhido. Atualize a página.");
  // D-WELCOMECHOICE: kit com produtos definidos vai com eles, seja o que for enviado pelo formulário.
  const preset = await presetProducts(prisma, kit.brandId, kit.presetProductIds);
  let chosen: { productId: string; quantity: number }[];
  try {
    chosen = preset ? preset.map((p) => ({ productId: p.id, quantity: 1 })) : validateKitChoice(items, kit.products, ctx.brand.slug);
  } catch (e) {
    throw new ShipmentError((e as Error).message);
  }
  const creator = await prisma.creator.findUniqueOrThrow({ where: { id: ctx.creatorId }, include: { account: true } });
  if (creator.status === "DEACTIVATED") throw new ShipmentError("Creator desligada não recebe envio.");
  const address = addressOf(creator.account);
  if (!address) throw new ShipmentError("Cadastre o endereço de entrega antes de escolher o kit.");
  const allowed = preset ?? (await kitProducts(prisma, kit.brandId));
  const title = new Map(allowed.map((p) => [p.id, p.title]));
  if (chosen.some((i) => !title.has(i.productId))) throw new ShipmentError("Produto indisponível. Atualize a página.");
  const empty = allowed.find((p) => p.outOfStock && chosen.some((i) => i.productId === p.id));
  if (empty) throw new ShipmentError(`${empty.title} está sem estoque no momento. Escolha outro produto.`);
  const now = new Date();

  return prisma.$transaction(async (tx) => {
    const shipment = await tx.shipment.create({
      data: {
        brandId: kit.brandId,
        creatorId: ctx.creatorId,
        status: "AWAITING_APPROVAL",
        note: `${kit.kind === "WELCOME" ? "Kit de boas-vindas" : kit.kind === "GOAL" ? "Meta de vendas (R$ 1.000)" : `Kit mensal — vendas de ${monthLabel(kit.month)}`} (${kit.products} ${kitNoun(ctx.brand.slug, kit.products)})`,
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
  const s = await prisma.shipment.findUnique({ where: { id: shipmentId }, select: { brandId: true, creatorId: true, status: true, balanceCents: true } });
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
    // M5.1 (D-SHOPBALANCE): compra com o saldo aprovada sai do extrato (a reserva some junto, na mesma transação).
    if (s.balanceCents) {
      const items = await tx.shipmentItem.findMany({ where: { shipmentId }, select: { title: true, quantity: true } });
      await tx.ledgerEntry.create({
        data: {
          brandId: s.brandId,
          creatorId: s.creatorId,
          type: "PURCHASE",
          amountCents: -s.balanceCents,
          availableAt: now,
          idempotencyKey: `purchase:${shipmentId}`,
          note: `Compra com o saldo: ${items.map((i) => `${i.quantity}× ${i.title}`).join(", ")}`.slice(0, 500),
          createdById: actor!.userId,
        },
      });
    }
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

/**
 * D-KITPROGRESS: como liberar o próximo produto, para a aba Pedidos. Marca com tabela mensal (Botanika): vendas do mês
 * e a próxima faixa. Outras: a janela atual da meta de R$ 1.000 (45 dias, depois 30) e quanto falta.
 */
export type KitProgress =
  | { kind: "TIER"; month: string; salesCents: number; total: number; next: { fromCents: number; total: number } | null; trial: boolean }
  | { kind: "GOAL"; from: string; to: string; salesCents: number; goalCents: number; granted: boolean };

export async function kitProgress(prisma: PrismaClient, ctx: PortalContext, now = new Date()): Promise<KitProgress | null> {
  const [brand, c] = await Promise.all([
    prisma.brand.findUniqueOrThrow({ where: { id: ctx.brand.id }, select: { timezone: true, monthlyKitFrom: true } }),
    prisma.creator.findUniqueOrThrow({ where: { id: ctx.creatorId }, select: { status: true, contractStart: true, activatedAt: true, goalStartAt: true, awaitingContractAt: true } }),
  ]);
  if (c.status !== "ACTIVE" || c.awaitingContractAt) return null;
  const month = monthKey(now, brand.timezone);
  if (brand.monthlyKitFrom && month >= brand.monthlyKitFrom) {
    const salesCents = (await salesByMonth(prisma, [ctx.creatorId], brand.timezone)).get(ctx.creatorId)!.get(month) ?? 0;
    const entry = c.contractStart ? c.contractStart.toISOString().slice(0, 10) : c.activatedAt ? dayKey(c.activatedAt, brand.timezone) : (c.goalStartAt?.toISOString().slice(0, 10) ?? null);
    const trial = entry !== null && isTierTrialMonth(entry, month);
    return { kind: "TIER", month, salesCents, total: tierProducts(salesCents, trial, ctx.brand.slug), next: nextTier(salesCents, trial, ctx.brand.slug), trial };
  }
  if (!c.goalStartAt) return null;
  const today = dayKey(now, brand.timezone);
  const w = goalWindowsUntil(c.goalStartAt.toISOString().slice(0, 10), today).at(-1);
  if (!w) return null;
  const [rows, granted] = await Promise.all([
    prisma.orderAttribution.findMany({
      where: {
        creatorId: ctx.creatorId,
        order: { paidAt: { gte: startOfLocalDay(w.from, brand.timezone), lt: startOfLocalDay(w.to, brand.timezone) }, financialStatus: { in: ["PAID", "PARTIALLY_REFUNDED"] }, cancelledAt: null, test: false },
      },
      select: { order: { select: { subtotalCents: true } } },
    }),
    prisma.kitGrant.count({ where: { creatorId: ctx.creatorId, kind: "GOAL", window: w.index } }),
  ]);
  return { kind: "GOAL", from: w.from, to: addDaysKey(w.to, -1), salesCents: rows.reduce((s, r) => s + Math.max(0, r.order.subtotalCents), 0), goalCents: GOAL_SALES_CENTS, granted: granted > 0 };
}

/** D-SHOPTAB: histórico dos produtos que ela ganhou (1º pedido, metas, meses), com a situação de cada um. */
export async function myKitHistory(prisma: PrismaClient, ctx: PortalContext) {
  return prisma.kitGrant.findMany({
    where: { creatorId: ctx.creatorId, brandId: ctx.brand.id },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: { id: true, kind: true, month: true, products: true, status: true, createdAt: true, shipment: { select: { status: true } } },
  });
}
