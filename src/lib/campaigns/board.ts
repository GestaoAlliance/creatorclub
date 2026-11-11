import type { PrismaClient } from "@/generated/prisma/client";
import { campaignPhase, inCampaignAudience, PAID_FINANCIAL, settleFrom, type CampaignPhase } from "@/domain";
import type { Actor } from "@/lib/auth/actor";
import { can } from "@/lib/auth/permissions";
import { bulkMessage } from "@/lib/creators/bulk";
import { CampaignError, campaignResults } from "./campaigns";

/**
 * Campanhas da equipe (D-CAMPAIGNBOARD, pedido do responsável em 2026-11-11): cartões vivos (fase, dias, inscritas de
 * quantas podem, vendas e pódio), o resultado (vendas das inscritas no período contra o mesmo tanto de dias antes),
 * quem do público ainda não se inscreveu, recados para convidar ou lembrar pelo WhatsApp da marca e duplicar campanha.
 * Público = creators ativas da marca (não arquivadas, contrato assinado) do tipo e das tags da campanha.
 */

const DAY = 86_400_000;

type CampaignLike = { id: string; brandId: string; categories: string[]; tagIds: string[]; startsAt: Date; endsAt: Date; publishedAt: Date | null; settledAt: Date | null; rankingPrizes: number[]; goalCents: number | null; goalPrizeCents: number | null };

/** Creators que a campanha alcança (ativas, do tipo e das tags). */
export async function campaignAudience(prisma: PrismaClient, c: Pick<CampaignLike, "brandId" | "categories" | "tagIds">) {
  const creators = await prisma.creator.findMany({
    where: { brandId: c.brandId, status: "ACTIVE", archivedAt: null, awaitingContractAt: null },
    select: { id: true, categories: true, tagLinks: { select: { tagId: true } }, account: { select: { name: true, phone: true } } },
  });
  return creators
    .filter((x) => inCampaignAudience(c, { categories: x.categories as string[], tagIds: x.tagLinks.map((t) => t.tagId) }))
    .map((x) => ({ id: x.id, name: x.account.name, hasPhone: Boolean(x.account.phone) }))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

/** Dia N de M (só em andamento) e quantos dias faltam para começar ou acabar. */
export function campaignClock(c: { startsAt: Date; endsAt: Date }, now: Date) {
  const total = Math.max(1, Math.round((c.endsAt.getTime() - c.startsAt.getTime()) / DAY));
  const day = Math.min(total, Math.max(0, Math.floor((now.getTime() - c.startsAt.getTime()) / DAY) + 1));
  const toStart = Math.ceil((c.startsAt.getTime() - now.getTime()) / DAY);
  const toEnd = Math.ceil((c.endsAt.getTime() - now.getTime()) / DAY);
  return { total, day, toStart, toEnd };
}

export type CampaignCard = {
  id: string;
  name: string;
  phase: CampaignPhase;
  startDay: string;
  endDay: string;
  clock: ReturnType<typeof campaignClock>;
  entries: number;
  audience: number;
  salesCents: number;
  podium: { creatorId: string; name: string; salesCents: number }[];
  prizes: { ranking: number[]; goalCents: number | null; goalPrizeCents: number | null };
  settleFrom: Date;
};

/** Cartões da lista: em andamento primeiro, depois em breve, prontas para confirmar, rascunhos e encerradas. */
export async function campaignCards(prisma: PrismaClient, actor: Actor | null, brandId: string, now = new Date()): Promise<CampaignCard[]> {
  if (!actor || !can(actor.grants, "creators.view", brandId)) throw new CampaignError("Sem permissão.");
  const list = await prisma.campaign.findMany({ where: { brandId }, orderBy: { startsAt: "desc" }, include: { _count: { select: { entries: true } } } });
  const cards = await Promise.all(
    list.map(async (c) => {
      const [standings, audience] = await Promise.all([campaignResults(prisma, c), campaignAudience(prisma, c)]);
      return {
        id: c.id,
        name: c.name,
        phase: campaignPhase(c, now),
        startDay: c.startDay,
        endDay: c.endDay,
        clock: campaignClock(c, now),
        entries: c._count.entries,
        audience: audience.length,
        salesCents: standings.reduce((s, r) => s + r.salesCents, 0),
        podium: standings.filter((s) => s.salesCents > 0).slice(0, 3).map((s) => ({ creatorId: s.creatorId, name: s.name, salesCents: s.salesCents })),
        prizes: { ranking: c.rankingPrizes, goalCents: c.goalCents, goalPrizeCents: c.goalPrizeCents },
        settleFrom: settleFrom(c.endsAt),
      };
    }),
  );
  const ORDER: Record<CampaignPhase, number> = { RUNNING: 0, SETTLE: 1, SOON: 2, WAITING: 3, DRAFT: 4, SETTLED: 5 };
  return cards.sort((a, b) => ORDER[a.phase] - ORDER[b.phase]);
}

export type CampaignImpact = {
  /** Vendas das inscritas no período (até agora) e no mesmo tanto de dias logo antes. */
  periodCents: number;
  beforeCents: number;
  days: number;
  sellers: number;
  entries: number;
  /** Prêmios: pagos (confirmada) ou previstos pelo placar de agora. */
  prizesCents: number;
  prizesPaid: boolean;
};

/** Quanto a campanha puxou: inscritas no período contra o mesmo tanto de dias antes (não começou: tudo zero). */
export async function campaignImpact(prisma: PrismaClient, c: CampaignLike, now = new Date()): Promise<CampaignImpact> {
  const until = new Date(Math.min(now.getTime(), c.endsAt.getTime()));
  const ms = Math.max(0, until.getTime() - c.startsAt.getTime());
  const entries = await prisma.campaignEntry.findMany({ where: { campaignId: c.id }, select: { creatorId: true } });
  const ids = entries.map((e) => e.creatorId);
  const before = new Date(c.startsAt.getTime() - ms);
  const orders = ids.length && ms > 0
    ? await prisma.order.findMany({
        where: { brandId: c.brandId, test: false, cancelledAt: null, financialStatus: { in: [...PAID_FINANCIAL] }, paidAt: { gte: before, lt: until }, attribution: { creatorId: { in: ids } } },
        select: { subtotalCents: true, paidAt: true, attribution: { select: { creatorId: true } } },
      })
    : [];
  let periodCents = 0;
  let beforeCents = 0;
  const sellers = new Set<string>();
  for (const o of orders) {
    if (o.paidAt! >= c.startsAt) {
      periodCents += o.subtotalCents;
      sellers.add(o.attribution!.creatorId);
    } else beforeCents += o.subtotalCents;
  }
  let prizesCents = 0;
  if (c.settledAt) prizesCents = (await prisma.campaignPrize.aggregate({ where: { campaignId: c.id }, _sum: { amountCents: true } }))._sum.amountCents ?? 0;
  else prizesCents = (await campaignResults(prisma, c)).reduce((s, r) => s + r.rankPrizeCents + r.goalPrizeCents, 0);
  return { periodCents, beforeCents, days: Math.round(ms / DAY), sellers: sellers.size, entries: ids.length, prizesCents, prizesPaid: c.settledAt !== null };
}

/** Do público, quem ainda não se inscreveu. */
export async function campaignInvitees(prisma: PrismaClient, c: CampaignLike) {
  const [audience, entries] = await Promise.all([campaignAudience(prisma, c), prisma.campaignEntry.findMany({ where: { campaignId: c.id }, select: { creatorId: true } })]);
  const joined = new Set(entries.map((e) => e.creatorId));
  return audience.filter((a) => !joined.has(a.id));
}

/**
 * Recado da campanha pelo WhatsApp da marca (D-CAMPAIGNBOARD, D-BULKMSG): convite para quem do público não se inscreveu
 * ou lembrete para as inscritas. Só campanha publicada e ainda não encerrada; o aviso leva para Campanhas no portal.
 */
export async function campaignMessage(prisma: PrismaClient, actor: Actor | null, campaignId: string, input: { to: "invite" | "entrants"; creatorIds: string[]; title: string; body: string }, now = new Date()) {
  const c = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!c) throw new CampaignError("Campanha não encontrada.");
  if (!actor || !can(actor.grants, "creators.edit", c.brandId)) throw new CampaignError("Sem permissão.");
  if (!c.publishedAt) throw new CampaignError("Publique a campanha antes de mandar recados.");
  if (c.endsAt <= now) throw new CampaignError("A campanha já acabou.");
  const allowed = new Set(
    input.to === "invite" ? (await campaignInvitees(prisma, c)).map((x) => x.id) : (await prisma.campaignEntry.findMany({ where: { campaignId }, select: { creatorId: true } })).map((e) => e.creatorId),
  );
  const ids = input.creatorIds.filter((id) => allowed.has(id));
  if (!ids.length) throw new CampaignError(input.to === "invite" ? "Ninguém para convidar entre as marcadas." : "Nenhuma inscrita entre as marcadas.");
  return bulkMessage(prisma, actor, c.brandId, ids, { title: input.title, body: input.body, path: "/campanhas", audit: { campaignId, to: input.to } });
}

/** Duplicar: nova campanha em rascunho com as mesmas regras (nome com "(cópia)"); ajuste as datas antes de publicar. */
export async function duplicateCampaign(prisma: PrismaClient, actor: Actor | null, campaignId: string) {
  const c = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!c) throw new CampaignError("Campanha não encontrada.");
  if (!actor || !can(actor.grants, "creators.edit", c.brandId)) throw new CampaignError("Sem permissão.");
  return prisma.$transaction(async (tx) => {
    const copy = await tx.campaign.create({
      data: {
        brandId: c.brandId,
        name: `${c.name} (cópia)`.slice(0, 80),
        briefing: c.briefing,
        startDay: c.startDay,
        endDay: c.endDay,
        startsAt: c.startsAt,
        endsAt: c.endsAt,
        categories: c.categories,
        tagIds: c.tagIds,
        rankingPrizes: c.rankingPrizes,
        goalCents: c.goalCents,
        goalPrizeCents: c.goalPrizeCents,
        allianceOsUrl: c.allianceOsUrl,
        createdById: actor.userId,
      },
      select: { id: true },
    });
    await tx.auditLog.create({ data: { brandId: c.brandId, actorType: "USER", actorId: actor.userId, action: "campaign.duplicate", entity: "Campaign", entityId: copy.id, after: { from: campaignId } } });
    return copy;
  });
}
