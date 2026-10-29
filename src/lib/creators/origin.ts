import type { PrismaClient } from "@/generated/prisma/client";
import { MANUAL_ORIGIN_KINDS, originFromApplication, originKey, UNKNOWN_ORIGIN, type Origin, type OriginKind } from "@/domain";
import type { Actor } from "@/lib/auth/actor";
import { can } from "@/lib/auth/permissions";

/**
 * Origem das creators (D-ORIGIN): candidatura aprovada (formulário e hunter) ou, sem candidatura, a marcada na ficha.
 * Quem vê: Gestão, Leitura e super admin (`performance.view`). Quem marca: Gestão (`creators.edit`).
 */

export class OriginError extends Error {}

/** Origem de cada creator (Map por id). */
export async function originsFor(prisma: PrismaClient, creatorIds: readonly string[]): Promise<Map<string, Origin>> {
  if (!creatorIds.length) return new Map();
  const [apps, creators] = await Promise.all([
    prisma.creatorApplication.findMany({
      where: { creatorId: { in: [...creatorIds] } },
      orderBy: { submittedAt: "asc" },
      select: { creatorId: true, source: true, submittedAt: true, campaignTag: true, heardFrom: true, hunterLink: { select: { user: { select: { id: true, name: true } } } }, _count: { select: { prospects: true } } },
    }),
    prisma.creator.findMany({ where: { id: { in: [...creatorIds] } }, select: { id: true, originKind: true, originNote: true, originHunter: { select: { id: true, name: true } } } }),
  ]);
  const out = new Map<string, Origin>();
  for (const a of apps) {
    if (!a.creatorId || out.has(a.creatorId)) continue; // a primeira inscrição vale
    out.set(a.creatorId, originFromApplication({ source: a.source, submittedAt: a.submittedAt, hunter: a.hunterLink?.user ?? null, prospected: a._count.prospects > 0, campaign: a.campaignTag, heardFrom: a.heardFrom }));
  }
  for (const c of creators) {
    if (out.has(c.id)) continue;
    out.set(c.id, c.originKind ? { kind: c.originKind as OriginKind, hunter: c.originHunter, day: null, manual: true, note: c.originNote } : UNKNOWN_ORIGIN);
  }
  return out;
}

/** Hunters da marca (para marcar a origem na ficha). */
export async function brandHunters(prisma: PrismaClient, brandId: string) {
  return prisma.user.findMany({
    where: { OR: [{ roleGrants: { some: { role: "HUNTER", brandId } } }, { hunterLinks: { some: { brandId } } }] },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
}

/** A Gestão marca a origem de quem não tem candidatura. `kind` vazio limpa. */
export async function setCreatorOrigin(prisma: PrismaClient, actor: Actor | null, creatorId: string, input: { kind: string; hunterId?: string | null; note?: string | null }) {
  const c = await prisma.creator.findUnique({ where: { id: creatorId }, select: { brandId: true, originKind: true, originHunterId: true, originNote: true } });
  if (!c) throw new OriginError("Creator não encontrada.");
  if (!actor || !can(actor.grants, "creators.edit", c.brandId)) throw new OriginError("Sem permissão.");
  if ((await prisma.creatorApplication.count({ where: { creatorId } })) > 0) throw new OriginError("Esta creator veio de uma inscrição; a origem é a da inscrição.");
  const kind = input.kind.trim();
  if (kind && !MANUAL_ORIGIN_KINDS.includes(kind as OriginKind)) throw new OriginError("Origem inválida.");
  const note = input.note?.trim().replace(/\s+/g, " ").slice(0, 200) || null;
  let hunterId = kind === "HUNTER" ? input.hunterId || null : null;
  if (hunterId && !(await brandHunters(prisma, c.brandId)).some((h) => h.id === hunterId)) throw new OriginError("Hunter não encontrado nesta marca.");
  if (!kind) hunterId = null;
  const data = { originKind: kind || null, originHunterId: hunterId, originNote: kind ? note : null };
  await prisma.$transaction([
    prisma.creator.update({ where: { id: creatorId }, data }),
    prisma.auditLog.create({
      data: { brandId: c.brandId, actorType: "USER", actorId: actor.userId, action: "creator.origin", entity: "Creator", entityId: creatorId, before: { kind: c.originKind, hunterId: c.originHunterId, note: c.originNote }, after: data },
    }),
  ]);
}

export type OriginSummaryRow = {
  key: string;
  origin: Pick<Origin, "kind" | "hunter" | "campaign">;
  /** Inscrições recebidas por este canal (todas as datas). */
  applications: number;
  approved: number;
  active: number;
  salesCents: number;
  sellers: number;
};

/** Resumo por origem (aba Origem do Desempenho): inscritas, aprovadas, ativas e vendas do mês. */
export async function originSummary(prisma: PrismaClient, actor: Actor | null, brandId: string, salesByCreator: ReadonlyMap<string, number>): Promise<OriginSummaryRow[]> {
  if (!actor || !can(actor.grants, "performance.view", brandId)) throw new OriginError("Sem permissão.");
  const [creators, apps] = await Promise.all([
    prisma.creator.findMany({ where: { brandId, archivedAt: null }, select: { id: true, status: true } }),
    prisma.creatorApplication.findMany({
      where: { brandId },
      select: { source: true, submittedAt: true, status: true, campaignTag: true, hunterLink: { select: { user: { select: { id: true, name: true } } } }, _count: { select: { prospects: true } } },
    }),
  ]);
  const origins = await originsFor(prisma, creators.map((c) => c.id));
  const rows = new Map<string, OriginSummaryRow>();
  const row = (o: Pick<Origin, "kind" | "hunter" | "campaign">) => {
    const key = originKey(o);
    if (!rows.has(key)) rows.set(key, { key, origin: { kind: o.kind, hunter: o.hunter, campaign: o.campaign ?? null }, applications: 0, approved: 0, active: 0, salesCents: 0, sellers: 0 });
    return rows.get(key)!;
  };
  for (const a of apps) {
    const r = row(originFromApplication({ source: a.source, submittedAt: a.submittedAt, hunter: a.hunterLink?.user ?? null, prospected: a._count.prospects > 0, campaign: a.campaignTag }));
    r.applications++;
    if (a.status === "APPROVED") r.approved++;
  }
  for (const c of creators) {
    const r = row(origins.get(c.id) ?? UNKNOWN_ORIGIN);
    if (c.status === "ACTIVE") r.active++;
    const sales = salesByCreator.get(c.id) ?? 0;
    r.salesCents += sales;
    if (sales > 0) r.sellers++;
  }
  return [...rows.values()].sort((a, b) => b.salesCents - a.salesCents || b.active - a.active || b.applications - a.applications);
}

export const canSeeOrigin = (actor: Actor | null, brandId: string) => Boolean(actor && can(actor.grants, "performance.view", brandId));
