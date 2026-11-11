import type { PrismaClient } from "@/generated/prisma/client";
import { computeBalance, contractStatus } from "@/domain";
import type { Actor } from "@/lib/auth/actor";
import { can } from "@/lib/auth/permissions";
import { ledgerEntriesWithMonth, openReservations, releasedThroughFor } from "@/lib/commission/release";
import { dayOf } from "./contract";
import { creatorTimeline, type TimelineEvent } from "./timeline";

/**
 * Painel lateral da lista de creators (D-CREATORLIST): o resumo que a equipe precisa sem sair da lista. Saldo e taxa só
 * para quem vê dinheiro; o resto (contrato, último envio, últimos acontecimentos) para quem vê creators da marca.
 */

export type CreatorPeek = {
  id: string;
  money: { availableCents: number; heldCents: number; rateBps: number | null; withdrawalsUnlocked: boolean; requestedCents: number } | null;
  contract: { start: string | null; end: string | null; status: "NONE" | "ACTIVE" | "EXPIRING" | "EXPIRED"; daysLeft: number | null };
  shipment: { status: string; day: Date } | null;
  events: TimelineEvent[];
};

export class PeekError extends Error {}

const SHIP_LABEL: Record<string, string> = { AWAITING_APPROVAL: "Kit pedido, espera aprovação", PREPARING: "Envio sendo preparado", SHIPPED: "Envio a caminho", DELIVERED: "Envio entregue", CANCELLED: "Envio cancelado" };

export async function creatorPeek(prisma: PrismaClient, actor: Actor | null, creatorId: string, now = new Date()): Promise<CreatorPeek> {
  const c = await prisma.creator.findUnique({
    where: { id: creatorId },
    select: { id: true, brandId: true, contractStart: true, contractEnd: true, withdrawalsUnlockedAt: true, brand: { select: { timezone: true } } },
  });
  if (!c || !actor || !can(actor.grants, "creators.view", c.brandId)) throw new PeekError("Creator não encontrada.");
  const money = can(actor.grants, "money.view", c.brandId);
  const [events, ship, moneyPart] = await Promise.all([
    creatorTimeline(prisma, actor, c.id, 6),
    prisma.shipment.findFirst({ where: { creatorId: c.id }, orderBy: { createdAt: "desc" }, select: { status: true, createdAt: true, shippedAt: true, deliveredAt: true } }),
    money
      ? Promise.all([
          ledgerEntriesWithMonth(prisma, [c.id], c.brand.timezone),
          openReservations(prisma, { creatorId: c.id, brandId: c.brandId }),
          releasedThroughFor(prisma, [c.id]),
          prisma.commissionPolicy.findFirst({
            where: { creatorId: c.id, confirmedAt: { not: null }, validFrom: { lte: now }, OR: [{ validTo: null }, { validTo: { gt: now } }] },
            select: { rateBps: true },
          }),
        ]).then(([entries, open, released, policy]) => {
          const b = computeBalance(entries, open, now, { releasedThrough: released.get(c.id) ?? null });
          return {
            availableCents: b.availableCents,
            heldCents: b.heldCents,
            rateBps: policy?.rateBps ?? null,
            withdrawalsUnlocked: c.withdrawalsUnlockedAt !== null,
            requestedCents: open.reduce((s, o) => s + o.amountCents, 0),
          };
        })
      : Promise.resolve(null),
  ]);
  return {
    id: c.id,
    money: moneyPart,
    contract: { start: dayOf(c.contractStart), end: dayOf(c.contractEnd), ...contractStatus(dayOf(c.contractEnd), now) },
    shipment: ship ? { status: SHIP_LABEL[ship.status] ?? ship.status, day: ship.deliveredAt ?? ship.shippedAt ?? ship.createdAt } : null,
    events,
  };
}
