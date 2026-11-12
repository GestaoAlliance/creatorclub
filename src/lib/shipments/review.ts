import type { PrismaClient } from "@/generated/prisma/client";
import type { PortalContext } from "@/lib/portal/context";
import { ShipmentError } from "./shipments";

/**
 * D-SHIPREVIEW: a creator avalia o envio depois de recebido (nota de 1 a 5 e, se quiser, um comentário curto). Uma vez
 * por envio, só dela, nunca na visualização da equipe. A equipe vê na ficha e na tela de Envios.
 * D-SHIPETA: previsão de chegada dos envios a caminho = data do envio + mediana de dias (envio → entrega) dos envios
 * entregues da marca nos últimos 180 dias para o mesmo estado (3+ envios), senão de todos os estados (3+), senão nada.
 */

const DAY = 86_400_000;

export async function reviewShipment(prisma: PrismaClient, ctx: PortalContext, actorUserId: string, input: { shipmentId: string; rating: number; comment?: string | null }) {
  if (ctx.viewAs) throw new ShipmentError("Visualização da equipe: nada é avaliado em nome da creator.");
  if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) throw new ShipmentError("Escolha de 1 a 5 estrelas.");
  const comment = input.comment?.trim().replace(/\s+/g, " ") || null;
  if (comment && comment.length > 280) throw new ShipmentError("Comentário com no máximo 280 letras.");
  const s = await prisma.shipment.findUnique({ where: { id: input.shipmentId }, select: { id: true, brandId: true, creatorId: true, status: true, review: { select: { id: true } } } });
  if (!s || s.creatorId !== ctx.creatorId || s.brandId !== ctx.brand.id) throw new ShipmentError("Envio não encontrado.");
  if (s.status !== "DELIVERED") throw new ShipmentError("Dá para avaliar depois de receber.");
  if (s.review) throw new ShipmentError("Você já avaliou este envio.");
  await prisma.$transaction([
    prisma.shipmentReview.create({ data: { brandId: s.brandId, creatorId: s.creatorId, shipmentId: s.id, rating: input.rating, comment, createdById: actorUserId } }),
    prisma.auditLog.create({ data: { brandId: s.brandId, actorType: "USER", actorId: actorUserId, action: "shipment.review", entity: "Shipment", entityId: s.id, after: { rating: input.rating, comment } } }),
  ]);
}

function median(xs: number[]) {
  const a = [...xs].sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m]! : (a[m - 1]! + a[m]!) / 2;
}

/** Previsão de chegada (data) de cada envio a caminho, pelo tempo dos envios entregues da marca. */
export async function shipmentEtas(prisma: PrismaClient, brandId: string, shipping: readonly { id: string; shippedAt: Date | null; address: unknown }[], now = new Date()): Promise<Map<string, Date>> {
  const out = new Map<string, Date>();
  if (!shipping.some((s) => s.shippedAt)) return out;
  const done = await prisma.shipment.findMany({
    where: { brandId, status: "DELIVERED", shippedAt: { not: null }, deliveredAt: { gte: new Date(now.getTime() - 180 * DAY) } },
    select: { shippedAt: true, deliveredAt: true, address: true },
  });
  const stateOf = (a: unknown) => (a && typeof a === "object" && typeof (a as Record<string, unknown>).state === "string" ? ((a as Record<string, string>).state ?? "").toUpperCase() : null);
  const days = done.map((d) => ({ state: stateOf(d.address), days: Math.max(0, (d.deliveredAt!.getTime() - d.shippedAt!.getTime()) / DAY) }));
  for (const s of shipping) {
    if (!s.shippedAt) continue;
    const st = stateOf(s.address);
    const same = days.filter((d) => st && d.state === st).map((d) => d.days);
    const pool = same.length >= 3 ? same : days.length >= 3 ? days.map((d) => d.days) : null;
    if (pool) out.set(s.id, new Date(s.shippedAt.getTime() + Math.ceil(median(pool)) * DAY));
  }
  return out;
}
