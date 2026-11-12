import type { PrismaClient } from "@/generated/prisma/client";
import { dayKey, isUgc, monthKey, nextMonthKey, startOfLocalDay, ugcPace, type UgcCycle } from "@/domain";
import type { Actor } from "@/lib/auth/actor";
import { can } from "@/lib/auth/permissions";
import { dayOf } from "@/lib/creators/contract";
import { ugcCyclesFor } from "@/lib/creators/ugc";

/**
 * Desempenho (D-PERFBOARD, pedido do responsável em 2026-11-12): Instagram, UGC e Origem. O ranking de vendas saiu
 * (está no Início); mínimo e kit foram para o painel da lista de Creators, o lucro já está na ficha.
 */

export class BoardError extends Error {}

const PAID = ["PAID", "PARTIALLY_REFUNDED"] as const;

/** Vendas do mês atual (pela data do pagamento, D-MONTH) por creator da marca. */
export async function monthSalesByCreator(prisma: PrismaClient, brandId: string, timeZone: string, now = new Date()): Promise<Map<string, number>> {
  const month = monthKey(now, timeZone);
  const rows = await prisma.orderAttribution.findMany({
    where: {
      brandId,
      order: { financialStatus: { in: [...PAID] }, cancelledAt: null, test: false, paidAt: { gte: startOfLocalDay(`${month}-01`, timeZone), lt: startOfLocalDay(`${nextMonthKey(month)}-01`, timeZone) } },
    },
    select: { creatorId: true, order: { select: { subtotalCents: true } } },
  });
  const out = new Map<string, number>();
  for (const r of rows) out.set(r.creatorId, (out.get(r.creatorId) ?? 0) + Math.max(0, r.order.subtotalCents));
  return out;
}

export type UgcCard = {
  id: string;
  name: string;
  hasPhone: boolean;
  cycle: UgcCycle;
  daysLeft: number | null;
  expected: number | null;
  late: boolean;
  salesCents: number;
  videos: { day: string; url: string; product: string | null }[];
};

const UGC_ORDER = { MISSED: 0, OPEN: 1, NO_CONTRACT: 2, DONE: 3 } as const;

/**
 * UGC ativas da marca com o ciclo de vídeos, o ritmo (atrasada ou não) e os vídeos entregues no ciclo (mais recentes
 * primeiro). Atrasadas e ciclos perdidos no topo; depois quem tem menos dias.
 */
export async function ugcBoard(prisma: PrismaClient, actor: Actor | null, brandId: string, salesByCreator: ReadonlyMap<string, number>, now = new Date()): Promise<UgcCard[]> {
  if (!actor || !can(actor.grants, "performance.view", brandId)) throw new BoardError("Sem permissão.");
  const brand = await prisma.brand.findUniqueOrThrow({ where: { id: brandId }, select: { timezone: true } });
  const creators = (
    await prisma.creator.findMany({
      where: { brandId, status: "ACTIVE", archivedAt: null },
      select: { id: true, categories: true, contractStart: true, contractEnd: true, ugcVideoGoal: true, account: { select: { name: true, phone: true } } },
    })
  ).filter((c) => isUgc(c.categories));
  if (!creators.length) return [];
  const [cycles, videos] = await Promise.all([
    ugcCyclesFor(prisma, creators, brand.timezone, now),
    prisma.ugcVideo.findMany({
      where: { creatorId: { in: creators.map((c) => c.id) }, removedAt: null },
      orderBy: [{ deliveredOn: "desc" }, { createdAt: "desc" }],
      select: { creatorId: true, deliveredOn: true, url: true, product: true },
    }),
  ]);
  const today = dayKey(now, brand.timezone);
  const cards = creators.map((c): UgcCard => {
    const cycle = cycles.get(c.id)!;
    const pace = ugcPace(cycle, today);
    const mine = videos
      .filter((v) => v.creatorId === c.id)
      .map((v) => ({ day: dayOf(v.deliveredOn)!, url: v.url, product: v.product }))
      .filter((v) => !cycle.start || !cycle.end || (v.day >= cycle.start && v.day <= cycle.end));
    return { id: c.id, name: c.account.name, hasPhone: Boolean(c.account.phone), cycle, ...pace, salesCents: salesByCreator.get(c.id) ?? 0, videos: mine.slice(0, 12) };
  });
  return cards.sort(
    (a, b) => Number(b.late) - Number(a.late) || UGC_ORDER[a.cycle.status] - UGC_ORDER[b.cycle.status] || (a.daysLeft ?? 9999) - (b.daysLeft ?? 9999) || a.name.localeCompare(b.name, "pt-BR"),
  );
}
