import type { PrismaClient } from "@/generated/prisma/client";
import {
  CAMPAIGN_TOP,
  campaignPhase,
  campaignStandings,
  firstNameOf,
  inCampaignAudience,
  isDayKey,
  nextDayKey,
  PAID_FINANCIAL,
  parseMoneyCents,
  settleFrom,
  startOfLocalDay,
  type CampaignRow,
  type Standing,
} from "@/domain";
import type { Actor } from "@/lib/auth/actor";
import { can } from "@/lib/auth/permissions";
import type { PortalContext } from "@/lib/portal/context";

/**
 * Campanhas e desafios (M4.5, D-CAMPAIGN): a Gestão cria (nome, briefing, período, público, prêmios do ranking e/ou
 * da meta; link do AllianceOS opcional) e publica; a creator se inscreve no portal e acompanha o placar; 7 dias
 * depois do fim a Gestão confirma as ganhadoras e cada prêmio vira um lançamento "Prêmio de campanha" no extrato,
 * já disponível. Depois de publicada, datas, público e prêmios não mudam (só nome, briefing e link).
 */

export class CampaignError extends Error {}

const CATS = ["INFLUENCER", "UGC", "PRESCRITOR"] as const;
type Cat = (typeof CATS)[number];

export type CampaignInput = {
  name: string;
  briefing: string;
  startDay: string;
  endDay: string;
  categories: string[];
  tagIds: string[];
  rankingPrizes: string[];
  goal: string;
  goalPrize: string;
  allianceOsUrl: string;
};

const money = (raw: string, label: string) => {
  try {
    return parseMoneyCents(raw);
  } catch {
    throw new CampaignError(`${label}: valor inválido (ex.: 500 ou 1.200,50).`);
  }
};

async function clean(prisma: PrismaClient, brandId: string, input: CampaignInput) {
  const name = input.name.replace(/\s+/g, " ").trim().slice(0, 80);
  if (!name) throw new CampaignError("Dê um nome à campanha.");
  const briefing = input.briefing.trim().replace(/\n{3,}/g, "\n\n").slice(0, 4000);
  if (!briefing) throw new CampaignError("Escreva o briefing (o que a creator deve divulgar).");
  if (!isDayKey(input.startDay) || !isDayKey(input.endDay)) throw new CampaignError("Informe o início e o fim.");
  if (input.startDay > input.endDay) throw new CampaignError("O fim vem depois do início.");
  const brand = await prisma.brand.findUniqueOrThrow({ where: { id: brandId }, select: { timezone: true } });
  const categories = [...new Set(input.categories)].filter((c): c is Cat => (CATS as readonly string[]).includes(c));
  const tagIds = [...new Set(input.tagIds.filter(Boolean))];
  if (tagIds.length && (await prisma.creatorTag.count({ where: { brandId, id: { in: tagIds } } })) !== tagIds.length) throw new CampaignError("Tag inválida.");
  const rankingPrizes: number[] = [];
  for (const [i, raw] of input.rankingPrizes.entries()) {
    const v = money(raw, `Prêmio do ${i + 1}º lugar`);
    if (v === null) break;
    if (v <= 0) throw new CampaignError(`Prêmio do ${i + 1}º lugar: maior que zero.`);
    rankingPrizes.push(v);
  }
  const goalCents = money(input.goal, "Meta");
  const goalPrizeCents = money(input.goalPrize, "Prêmio da meta");
  if ((goalCents === null) !== (goalPrizeCents === null)) throw new CampaignError("Para a meta, informe o valor e o prêmio.");
  if ((goalCents !== null && goalCents <= 0) || (goalPrizeCents !== null && goalPrizeCents <= 0)) throw new CampaignError("Meta e prêmio maiores que zero.");
  if (!rankingPrizes.length && goalCents === null) throw new CampaignError("Defina prêmios do ranking, a meta, ou os dois.");
  const url = input.allianceOsUrl.trim();
  if (url && !/^https:\/\/\S+$/.test(url)) throw new CampaignError("Link do AllianceOS: cole o endereço completo (https://…).");
  return {
    name,
    briefing,
    startDay: input.startDay,
    endDay: input.endDay,
    startsAt: startOfLocalDay(input.startDay, brand.timezone),
    endsAt: startOfLocalDay(nextDayKey(input.endDay), brand.timezone),
    categories,
    tagIds,
    rankingPrizes,
    goalCents,
    goalPrizeCents,
    allianceOsUrl: url || null,
  };
}

function editor(actor: Actor | null, brandId: string): Actor {
  if (!actor || !can(actor.grants, "creators.edit", brandId)) throw new CampaignError("Sem permissão.");
  return actor;
}

const audit = (prisma: PrismaClient, actor: Actor, brandId: string, action: string, id: string, after: object = {}) =>
  prisma.auditLog.create({ data: { brandId, actorType: "USER", actorId: actor.userId, action, entity: "Campaign", entityId: id, after } });

export async function createCampaign(prisma: PrismaClient, actor: Actor | null, brandId: string, input: CampaignInput) {
  const who = editor(actor, brandId);
  const data = await clean(prisma, brandId, input);
  return prisma.$transaction(async (tx) => {
    const c = await tx.campaign.create({ data: { brandId, ...data, createdById: who.userId }, select: { id: true } });
    await audit(tx as unknown as PrismaClient, who, brandId, "campaign.create", c.id, { name: data.name });
    return c;
  });
}

export async function updateCampaign(prisma: PrismaClient, actor: Actor | null, id: string, input: CampaignInput) {
  const c = await prisma.campaign.findUnique({ where: { id }, select: { brandId: true, publishedAt: true, settledAt: true } });
  if (!c) throw new CampaignError("Campanha não encontrada.");
  const who = editor(actor, c.brandId);
  if (c.settledAt) throw new CampaignError("Prêmios já confirmados: a campanha não muda mais.");
  const data = await clean(prisma, c.brandId, input);
  // Publicada: as creators já veem as regras; só nome, briefing e link mudam.
  const patch = c.publishedAt ? { name: data.name, briefing: data.briefing, allianceOsUrl: data.allianceOsUrl } : data;
  await prisma.$transaction([prisma.campaign.update({ where: { id }, data: patch }), audit(prisma, who, c.brandId, "campaign.update", id, { fields: Object.keys(patch) })]);
}

export async function publishCampaign(prisma: PrismaClient, actor: Actor | null, id: string, now = new Date()) {
  const c = await prisma.campaign.findUnique({ where: { id }, select: { brandId: true, publishedAt: true, endsAt: true } });
  if (!c) throw new CampaignError("Campanha não encontrada.");
  const who = editor(actor, c.brandId);
  if (c.publishedAt) return;
  if (c.endsAt <= now) throw new CampaignError("O período já acabou; ajuste as datas antes de publicar.");
  await prisma.$transaction([prisma.campaign.update({ where: { id }, data: { publishedAt: now } }), audit(prisma, who, c.brandId, "campaign.publish", id)]);
}

/** Vendas das inscritas no período (pagas no período, régua da comissão) e o placar. */
export async function campaignResults(prisma: PrismaClient, c: { id: string; brandId: string; startsAt: Date; endsAt: Date; rankingPrizes: number[]; goalCents: number | null; goalPrizeCents: number | null }): Promise<Standing[]> {
  const entries = await prisma.campaignEntry.findMany({ where: { campaignId: c.id }, select: { creatorId: true, creator: { select: { account: { select: { name: true } } } } } });
  const ids = entries.map((e) => e.creatorId);
  const orders = ids.length
    ? await prisma.order.findMany({
        where: { brandId: c.brandId, test: false, cancelledAt: null, financialStatus: { in: [...PAID_FINANCIAL] }, paidAt: { gte: c.startsAt, lt: c.endsAt }, attribution: { creatorId: { in: ids } } },
        select: { subtotalCents: true, paidAt: true, attribution: { select: { creatorId: true } } },
      })
    : [];
  const by = new Map<string, CampaignRow>(entries.map((e) => [e.creatorId, { creatorId: e.creatorId, name: e.creator.account.name, salesCents: 0, reachedAt: null }]));
  for (const o of orders) {
    const r = by.get(o.attribution!.creatorId)!;
    r.salesCents += o.subtotalCents;
    if (!r.reachedAt || o.paidAt! > r.reachedAt) r.reachedAt = o.paidAt!;
  }
  return campaignStandings([...by.values()], c.rankingPrizes, c.goalCents && c.goalPrizeCents ? { cents: c.goalCents, prizeCents: c.goalPrizeCents } : null);
}

/** Lista da equipe (marca do topo). */
export async function staffCampaigns(prisma: PrismaClient, actor: Actor | null, brandId: string, now = new Date()) {
  if (!actor || !can(actor.grants, "creators.view", brandId)) throw new CampaignError("Sem permissão.");
  const list = await prisma.campaign.findMany({ where: { brandId }, orderBy: { startsAt: "desc" }, include: { _count: { select: { entries: true } } } });
  return list.map((c) => ({ ...c, entriesCount: c._count.entries, phase: campaignPhase(c, now), settleFrom: settleFrom(c.endsAt) }));
}

/** Detalhe para a equipe: campanha, placar completo e o que já foi pago. */
export async function campaignDetail(prisma: PrismaClient, actor: Actor | null, id: string, now = new Date()) {
  const c = await prisma.campaign.findUnique({ where: { id }, include: { prizes: { select: { creatorId: true, kind: true, position: true, amountCents: true } } } });
  if (!c || !actor || !can(actor.grants, "creators.view", c.brandId)) throw new CampaignError("Campanha não encontrada.");
  const tags = c.tagIds.length ? await prisma.creatorTag.findMany({ where: { id: { in: c.tagIds } }, select: { id: true, name: true } }) : [];
  return { ...c, tags, phase: campaignPhase(c, now), settleFrom: settleFrom(c.endsAt), standings: await campaignResults(prisma, c), canEdit: can(actor.grants, "creators.edit", c.brandId) };
}

/** Confirma as ganhadoras (a partir de 7 dias depois do fim): prêmios no extrato, já disponíveis; uma vez só. */
export async function settleCampaign(prisma: PrismaClient, actor: Actor | null, id: string, now = new Date()) {
  const c = await prisma.campaign.findUnique({ where: { id } });
  if (!c) throw new CampaignError("Campanha não encontrada.");
  const who = editor(actor, c.brandId);
  if (campaignPhase(c, now) !== "SETTLE") {
    throw new CampaignError(c.settledAt ? "Os prêmios já foram confirmados." : `Só dá para confirmar a partir de ${settleFrom(c.endsAt).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}.`);
  }
  const standings = await campaignResults(prisma, c);
  const prizes = standings.flatMap((s) => [
    ...(s.rankPrizeCents ? [{ s, kind: "RANK" as const, amountCents: s.rankPrizeCents, note: `Prêmio: ${c.name} (${s.position}º lugar)` }] : []),
    ...(s.goalPrizeCents ? [{ s, kind: "GOAL" as const, amountCents: s.goalPrizeCents, note: `Prêmio: ${c.name} (meta atingida)` }] : []),
  ]);
  await prisma.$transaction(async (tx) => {
    const { count } = await tx.campaign.updateMany({ where: { id, settledAt: null }, data: { settledAt: now, settledById: who.userId } });
    if (!count) throw new CampaignError("Os prêmios já foram confirmados.");
    for (const p of prizes) {
      const entry = await tx.ledgerEntry.create({
        data: { brandId: c.brandId, creatorId: p.s.creatorId, type: "PRIZE", amountCents: p.amountCents, availableAt: now, idempotencyKey: `prize:${id}:${p.s.creatorId}:${p.kind}`, note: p.note, createdById: who.userId },
        select: { id: true },
      });
      await tx.campaignPrize.create({
        data: { campaignId: id, creatorId: p.s.creatorId, brandId: c.brandId, kind: p.kind, position: p.kind === "RANK" ? p.s.position : null, salesCents: p.s.salesCents, amountCents: p.amountCents, ledgerEntryId: entry.id, createdById: who.userId },
      });
    }
    await tx.auditLog.create({ data: { brandId: c.brandId, actorType: "USER", actorId: who.userId, action: "campaign.settle", entity: "Campaign", entityId: id, after: { prizes: prizes.length, totalCents: prizes.reduce((t, p) => t + p.amountCents, 0) } } });
  });
  return { prizes: prizes.length, totalCents: prizes.reduce((t, p) => t + p.amountCents, 0) };
}

async function creatorFacts(prisma: PrismaClient, creatorId: string) {
  const c = await prisma.creator.findUniqueOrThrow({ where: { id: creatorId }, select: { status: true, categories: true, tagLinks: { select: { tagId: true } } } });
  return { status: c.status, categories: c.categories as string[], tagIds: c.tagLinks.map((t) => t.tagId) };
}

/** Campanhas que a creator vê no portal: publicadas, do público dela, em breve, em andamento ou encerradas há até 30 dias. */
export async function portalCampaigns(prisma: PrismaClient, ctx: PortalContext, now = new Date()) {
  const me = await creatorFacts(prisma, ctx.creatorId);
  const list = await prisma.campaign.findMany({
    where: { brandId: ctx.brand.id, publishedAt: { not: null }, endsAt: { gt: new Date(now.getTime() - 30 * 86_400_000) } },
    orderBy: { startsAt: "asc" },
    include: { entries: { where: { creatorId: ctx.creatorId }, select: { joinedAt: true } }, prizes: { where: { creatorId: ctx.creatorId }, select: { amountCents: true, kind: true, position: true } } },
  });
  const visible = list.filter((c) => c.entries.length > 0 || inCampaignAudience(c, me));
  return Promise.all(
    visible.map(async (c) => {
      const joined = c.entries.length > 0;
      const standings = joined ? await campaignResults(prisma, c) : [];
      const mine = standings.find((s) => s.creatorId === ctx.creatorId) ?? null;
      const above = mine && mine.position > 1 ? standings[mine.position - 2]! : null;
      return {
        id: c.id,
        name: c.name,
        briefing: c.briefing,
        startDay: c.startDay,
        endDay: c.endDay,
        phase: campaignPhase(c, now),
        rankingPrizes: c.rankingPrizes,
        goalCents: c.goalCents,
        goalPrizeCents: c.goalPrizeCents,
        joined,
        canJoin: !joined && me.status === "ACTIVE" && now < c.endsAt && !ctx.viewAs,
        participants: standings.length,
        // Placar: posição e primeiro nome das 10 primeiras, sem valores das outras (D-CAMPAIGN).
        top: standings.slice(0, CAMPAIGN_TOP).map((s) => ({ position: s.position, name: firstNameOf(s.name), me: s.creatorId === ctx.creatorId })),
        me: mine ? { position: mine.position, salesCents: mine.salesCents, // Para passar quem está acima: 1 centavo a mais (no empate, fica na frente quem chegou antes).
          toAboveCents: above ? above.salesCents - mine.salesCents + 1 : null, toGoalCents: c.goalCents ? Math.max(0, c.goalCents - mine.salesCents) : null } : null,
        prizes: c.prizes,
      };
    }),
  );
}

/** "Quero participar": publicada, ainda não terminou, do público dela, creator ativa; nunca na visualização da equipe. */
export async function joinCampaign(prisma: PrismaClient, ctx: PortalContext, campaignId: string, now = new Date()) {
  if (ctx.viewAs) throw new CampaignError("Visualização da equipe: nada é alterado em nome da creator.");
  const c = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!c || c.brandId !== ctx.brand.id || !c.publishedAt) throw new CampaignError("Campanha não encontrada.");
  if (now >= c.endsAt) throw new CampaignError("Esta campanha já terminou.");
  const me = await creatorFacts(prisma, ctx.creatorId);
  if (me.status !== "ACTIVE") throw new CampaignError("Só creators ativas participam.");
  if (!inCampaignAudience(c, me)) throw new CampaignError("Esta campanha não é para o seu perfil.");
  await prisma.campaignEntry.createMany({ data: [{ campaignId, creatorId: ctx.creatorId, brandId: c.brandId, joinedAt: now }], skipDuplicates: true });
}
