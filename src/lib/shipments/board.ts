import type { PrismaClient } from "@/generated/prisma/client";
import { monthKey, nextMonthKey, startOfLocalDay } from "@/domain";
import type { Actor } from "@/lib/auth/actor";
import { can } from "@/lib/auth/permissions";
import { productImages } from "@/lib/reports/product-images";
import { RECEIPT_CHECK_DAYS } from "./reminders";

/**
 * Faixa e extras da tela de Envios (D-SHIPBOARD, pedido do responsável em 2026-11-12), da marca escolhida no topo:
 * quantos em cada etapa, sem "Recebi" há 10+ dias, atrasados no Olist (erro ou Preparando há 3+ dias), produtos que
 * saíram no mês (com foto) e o frete somado, e o contexto de cada creator para não mandar repetido (outros envios
 * abertos, último enviado, kits liberados esperando a escolha dela).
 */

export class ShipmentBoardError extends Error {}

const DAY = 86_400_000;
export const OLIST_LATE_DAYS = 3;
const KIT_LABEL: Record<string, string> = { WELCOME: "kit de boas-vindas", MONTHLY: "kit do mês", GOAL: "kit da meta" };

export type CreatorShipContext = { total: number; lastSentAt: Date | null; openCount: number; pendingKits: { label: string; products: number }[] };

export async function shipmentBoard(prisma: PrismaClient, actor: Actor | null, brandId: string, creatorIds: readonly string[], now = new Date()) {
  if (!actor || !can(actor.grants, "shipping.view", brandId)) throw new ShipmentBoardError("Sem permissão.");
  const brand = await prisma.brand.findUniqueOrThrow({ where: { id: brandId }, select: { timezone: true } });
  const month = monthKey(now, brand.timezone);
  const range = { gte: startOfLocalDay(`${month}-01`, brand.timezone), lt: startOfLocalDay(`${nextMonthKey(month)}-01`, brand.timezone) };
  const ids = [...new Set(creatorIds)];
  const [byStatus, stale, delivered, late, monthShip, ctxShip, kits, imageOf] = await Promise.all([
    prisma.shipment.groupBy({ by: ["status"], where: { brandId }, _count: true }),
    prisma.shipment.count({ where: { brandId, status: "SHIPPED", shippedAt: { lte: new Date(now.getTime() - RECEIPT_CHECK_DAYS * DAY) } } }),
    prisma.shipment.count({ where: { brandId, status: "DELIVERED", deliveredAt: range } }),
    prisma.shipment.findMany({
      where: { brandId, status: "PREPARING", OR: [{ olistError: { not: null } }, { createdAt: { lte: new Date(now.getTime() - OLIST_LATE_DAYS * DAY) } }] },
      orderBy: { createdAt: "asc" },
      select: { id: true, createdAt: true, approvedAt: true, olistError: true, olistOrderNumber: true, creator: { select: { account: { select: { name: true } } } } },
    }),
    prisma.shipment.findMany({ where: { brandId, status: { in: ["SHIPPED", "DELIVERED"] }, shippedAt: range }, select: { freightCents: true, items: { select: { title: true, quantity: true } } } }),
    ids.length ? prisma.shipment.findMany({ where: { creatorId: { in: ids }, status: { not: "CANCELLED" } }, select: { creatorId: true, status: true, shippedAt: true } }) : Promise.resolve([]),
    ids.length ? prisma.kitGrant.findMany({ where: { creatorId: { in: ids }, status: "PENDING" }, select: { creatorId: true, kind: true, products: true } }) : Promise.resolve([]),
    productImages(prisma, brandId),
  ]);

  const count = (s: string) => byStatus.find((b) => b.status === s)?._count ?? 0;
  const units = new Map<string, number>();
  for (const s of monthShip) for (const it of s.items) units.set(it.title, (units.get(it.title) ?? 0) + it.quantity);
  const products = [...units].map(([title, qty]) => ({ title, units: qty, image: imageOf(title) })).sort((a, b) => b.units - a.units || a.title.localeCompare(b.title, "pt-BR"));

  const context = new Map<string, CreatorShipContext>();
  for (const id of ids) {
    const mine = ctxShip.filter((s) => s.creatorId === id);
    const sent = mine.map((s) => s.shippedAt).filter((d): d is Date => d !== null).sort((a, b) => b.getTime() - a.getTime());
    context.set(id, {
      total: mine.length,
      lastSentAt: sent[0] ?? null,
      openCount: mine.filter((s) => s.status === "AWAITING_APPROVAL" || s.status === "PREPARING").length,
      pendingKits: kits.filter((k) => k.creatorId === id).map((k) => ({ label: KIT_LABEL[k.kind] ?? "kit", products: k.products })),
    });
  }

  return {
    counts: { awaiting: count("AWAITING_APPROVAL"), preparing: count("PREPARING"), shipped: count("SHIPPED"), stale, deliveredThisMonth: delivered },
    olistLate: late.map((s) => ({
      id: s.id,
      name: s.creator.account.name,
      days: Math.floor((now.getTime() - (s.approvedAt ?? s.createdAt).getTime()) / DAY),
      reason: s.olistError ? `não foi para o Olist: ${s.olistError}` : s.olistOrderNumber ? `no Olist (nº ${s.olistOrderNumber}), ainda sem envio` : "ainda sem envio",
    })),
    month: { products, units: products.reduce((s, p) => s + p.units, 0), freightCents: monthShip.reduce((s, x) => s + (x.freightCents ?? 0), 0), shipments: monthShip.length },
    context,
  };
}
