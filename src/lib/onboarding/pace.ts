import type { PrismaClient } from "@/generated/prisma/client";

/**
 * Ritmo da equipe nas candidatas (D-CANDBOARD, pedido do responsável em 2026-11-11): decididas nos últimos 30 dias
 * (aprovadas e recusadas), o tempo médio entre a inscrição e a decisão, e quem foi aprovada e ainda não assinou o
 * contrato (com as que esperam há mais de 3 dias). Só indicadores; a lista é que filtra.
 */

const DAY = 86_400_000;
export const WAITING_SLOW_DAYS = 3;

export type ApplicationsPace = { approved30: number; rejected30: number; avgDecisionDays: number | null; waiting: number; waitingSlow: number };

export async function applicationsPace(prisma: PrismaClient, brandId: string, now = new Date()): Promise<ApplicationsPace> {
  const since = new Date(now.getTime() - 30 * DAY);
  const [decided, waiting] = await Promise.all([
    prisma.creatorApplication.findMany({ where: { brandId, status: { in: ["APPROVED", "REJECTED"] }, decidedAt: { gte: since } }, select: { status: true, submittedAt: true, decidedAt: true } }),
    prisma.creator.findMany({ where: { brandId, awaitingContractAt: { not: null }, archivedAt: null }, select: { awaitingContractAt: true } }),
  ]);
  const days = decided.map((d) => Math.max(0, (d.decidedAt!.getTime() - d.submittedAt.getTime()) / DAY));
  return {
    approved30: decided.filter((d) => d.status === "APPROVED").length,
    rejected30: decided.filter((d) => d.status === "REJECTED").length,
    avgDecisionDays: days.length ? Math.round((days.reduce((s, v) => s + v, 0) / days.length) * 10) / 10 : null,
    waiting: waiting.length,
    waitingSlow: waiting.filter((w) => w.awaitingContractAt!.getTime() <= now.getTime() - WAITING_SLOW_DAYS * DAY).length,
  };
}
