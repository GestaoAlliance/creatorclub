import type { PrismaClient } from "@/generated/prisma/client";
import { PAID_FINANCIAL } from "@/domain";
import type { Actor } from "@/lib/auth/actor";
import { can } from "@/lib/auth/permissions";
import { HunterError } from "./hunters";

/**
 * Ranking dos hunters (D-HUNTERBOARD, pedido do responsável em 2026-11-11): o funil de cada hunter na marca do topo,
 * no período escolhido: cliques no link → candidatas que chegaram pelo link → aprovadas → creators que já venderam (e
 * quanto venderam no período). Candidatas e aprovadas contam pela data da inscrição; vendas pela data do pagamento.
 * Parado = sem candidata nos últimos 30 dias. Os cliques das últimas 12 semanas viram o mini gráfico.
 */

const DAY = 86_400_000;
export const HUNTER_IDLE_DAYS = 30;
const WEEKS = 12;

export type HunterRow = {
  userId: string;
  name: string;
  email: string;
  phone: string | null;
  link: { code: string } | null;
  clicks: number;
  applications: number;
  approved: number;
  selling: number;
  salesCents: number;
  lastApplication: Date | null;
  idle: boolean;
  weeks: number[];
};

export async function hunterBoard(prisma: PrismaClient, actor: Actor | null, brandId: string, days: number | null, now = new Date()) {
  if (!actor || !can(actor.grants, "creators.edit", brandId)) throw new HunterError("Sem permissão.");
  const since = days ? new Date(now.getTime() - days * DAY) : new Date(0);
  const brand = await prisma.brand.findUniqueOrThrow({ where: { id: brandId }, select: { slug: true, name: true } });
  const [grants, links] = await Promise.all([
    prisma.roleGrant.findMany({ where: { role: "HUNTER", user: { disabledAt: null }, OR: [{ brandId }, { brandId: null }] }, select: { user: { select: { id: true, name: true, email: true, phone: true } } } }),
    prisma.hunterLink.findMany({ where: { brandId }, select: { id: true, userId: true, code: true } }),
  ]);
  const linkIds = links.map((l) => l.id);
  const [clicks, weekly, apps] = await Promise.all([
    prisma.hunterClick.groupBy({ by: ["hunterLinkId"], where: { hunterLinkId: { in: linkIds }, createdAt: { gte: since } }, _count: true }),
    prisma.hunterClick.findMany({ where: { hunterLinkId: { in: linkIds }, createdAt: { gte: new Date(now.getTime() - WEEKS * 7 * DAY) } }, select: { hunterLinkId: true, createdAt: true } }),
    prisma.creatorApplication.findMany({ where: { brandId, hunterLinkId: { in: linkIds } }, select: { hunterLinkId: true, status: true, submittedAt: true, creatorId: true } }),
  ]);
  const creatorIds = apps.filter((a) => a.creatorId && a.submittedAt >= since).map((a) => a.creatorId!);
  const orders = creatorIds.length
    ? await prisma.order.findMany({
        where: { brandId, test: false, cancelledAt: null, financialStatus: { in: [...PAID_FINANCIAL] }, paidAt: { gte: since }, attribution: { creatorId: { in: creatorIds } } },
        select: { subtotalCents: true, attribution: { select: { creatorId: true } } },
      })
    : [];
  const salesBy = new Map<string, number>();
  for (const o of orders) salesBy.set(o.attribution!.creatorId, (salesBy.get(o.attribution!.creatorId) ?? 0) + o.subtotalCents);
  const clicksBy = new Map(clicks.map((c) => [c.hunterLinkId, c._count]));
  const idleSince = new Date(now.getTime() - HUNTER_IDLE_DAYS * DAY);

  const users = new Map(grants.map((g) => [g.user.id, g.user]));
  const rows: HunterRow[] = [...users.values()].map((u) => {
    const l = links.find((x) => x.userId === u.id) ?? null;
    const mine = l ? apps.filter((a) => a.hunterLinkId === l.id) : [];
    const inPeriod = mine.filter((a) => a.submittedAt >= since);
    const approved = inPeriod.filter((a) => a.status === "APPROVED" && a.creatorId);
    const weeks = Array<number>(WEEKS).fill(0);
    if (l) for (const c of weekly) if (c.hunterLinkId === l.id) {
      const ago = Math.floor((now.getTime() - c.createdAt.getTime()) / (7 * DAY));
      if (ago >= 0 && ago < WEEKS) weeks[WEEKS - 1 - ago]!++;
    }
    const last = mine.reduce<Date | null>((m, a) => (!m || a.submittedAt > m ? a.submittedAt : m), null);
    return {
      userId: u.id,
      name: u.name,
      email: u.email,
      phone: u.phone,
      link: l ? { code: l.code } : null,
      clicks: l ? (clicksBy.get(l.id) ?? 0) : 0,
      applications: inPeriod.length,
      approved: approved.length,
      selling: approved.filter((a) => (salesBy.get(a.creatorId!) ?? 0) > 0).length,
      salesCents: approved.reduce((s, a) => s + (salesBy.get(a.creatorId!) ?? 0), 0),
      lastApplication: last,
      idle: !last || last < idleSince,
      weeks,
    };
  });
  rows.sort((a, b) => b.salesCents - a.salesCents || b.approved - a.approved || b.applications - a.applications || b.clicks - a.clicks || a.name.localeCompare(b.name, "pt-BR"));
  return { brand, rows };
}
