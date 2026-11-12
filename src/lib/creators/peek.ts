import type { PrismaClient } from "@/generated/prisma/client";
import { accumulatedSales, computeBalance, contractStatus, kitProgress, monthKey, parseKitTiers, releaseMinFor, type KitProgress } from "@/domain";
import type { Actor } from "@/lib/auth/actor";
import { can } from "@/lib/auth/permissions";
import { ledgerEntriesWithMonth, openReservations, releaseAmountsByMonth, releasedThroughFor } from "@/lib/commission/release";
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
  /** Meta do mês (D-PERFBOARD, saiu do ranking do Desempenho): mínimo do contrato acumulado até hoje e a faixa do kit. */
  goal: { min: { accumulatedCents: number; minCents: number; basis: "SALES" | "COMMISSION" } | null; kit: KitProgress | null; brandSlug: string } | null;
  events: TimelineEvent[];
};

export class PeekError extends Error {}

const SHIP_LABEL: Record<string, string> = { AWAITING_APPROVAL: "Kit pedido, espera aprovação", PREPARING: "Envio sendo preparado", SHIPPED: "Envio a caminho", DELIVERED: "Envio entregue", CANCELLED: "Envio cancelado" };

export async function creatorPeek(prisma: PrismaClient, actor: Actor | null, creatorId: string, now = new Date()): Promise<CreatorPeek> {
  const c = await prisma.creator.findUnique({
    where: { id: creatorId },
    select: {
      id: true,
      brandId: true,
      categories: true,
      contractStart: true,
      contractEnd: true,
      withdrawalsUnlockedAt: true,
      contractTemplate: { select: { releaseMinCents: true, kitTiers: true } },
      brand: { select: { slug: true, timezone: true, releaseMinCents: true, releaseMinPrescriberCents: true, releaseBasis: true } },
    },
  });
  if (!c || !actor || !can(actor.grants, "creators.view", c.brandId)) throw new PeekError("Creator não encontrada.");
  const money = can(actor.grants, "money.view", c.brandId);
  const [events, ship, moneyPart, goal] = await Promise.all([
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
    money ? monthGoal(prisma, c, now) : Promise.resolve(null),
  ]);
  return {
    id: c.id,
    money: moneyPart,
    contract: { start: dayOf(c.contractStart), end: dayOf(c.contractEnd), ...contractStatus(dayOf(c.contractEnd), now) },
    shipment: ship ? { status: SHIP_LABEL[ship.status] ?? ship.status, day: ship.deliveredAt ?? ship.shippedAt ?? ship.createdAt } : null,
    goal,
    events,
  };
}

type GoalCreator = {
  id: string;
  categories: string[];
  contractTemplate: { releaseMinCents: number | null; kitTiers: unknown } | null;
  brand: { slug: string; timezone: string; releaseMinCents: number; releaseMinPrescriberCents: number; releaseBasis: "SALES" | "COMMISSION" };
};

/** Mesma régua do Desempenho antigo (D-CONTRACT, D-MIN100): acumulado desde a última liberação até o mês atual; kit pelas vendas do mês. */
async function monthGoal(prisma: PrismaClient, c: GoalCreator, now: Date): Promise<CreatorPeek["goal"]> {
  const tz = c.brand.timezone;
  const current = monthKey(now, tz);
  const minCents = releaseMinFor(c.categories, c.brand, c.contractTemplate);
  const tiers = parseKitTiers(c.contractTemplate?.kitTiers);
  if (minCents === null && tiers.length === 0) return null;
  const [sales, basis, released] = await Promise.all([
    releaseAmountsByMonth(prisma, [c.id], tz, "SALES"),
    c.brand.releaseBasis === "COMMISSION" ? releaseAmountsByMonth(prisma, [c.id], tz, "COMMISSION") : Promise.resolve(null),
    releasedThroughFor(prisma, [c.id]),
  ]);
  const byMonth = (basis ?? sales).get(c.id) ?? new Map<string, number>();
  return {
    min: minCents === null ? null : { accumulatedCents: accumulatedSales(byMonth, released.get(c.id) ?? null, current), minCents, basis: c.brand.releaseBasis },
    kit: tiers.length ? kitProgress(tiers, sales.get(c.id)?.get(current) ?? 0) : null,
    brandSlug: c.brand.slug,
  };
}
