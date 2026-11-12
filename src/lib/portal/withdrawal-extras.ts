import type { PrismaClient } from "@/generated/prisma/client";
import { dayKey, rejectReasons, withdrawalWindow } from "@/domain";
import type { PortalContext } from "./context";

/**
 * Extras da aba Saque do portal (D-PORTALWD, pedido do responsável em 2026-11-12): janela de pedido (aberta/quando
 * abre), total recebido (no total e no ano), chave Pix com parte escondida e os motivos de recusa que mais se repetem
 * na marca (só os repetidos, 2+ vezes, e curtos: genéricos, sem dado de outra creator).
 */

const DAY = 86_400_000;
export const maskPix = (pix: string) => (pix.length <= 6 ? "•••" : `${pix.slice(0, 3)}•••${pix.slice(-3)}`);

export async function portalWithdrawalExtras(prisma: PrismaClient, ctx: PortalContext, now = new Date()) {
  const brand = await prisma.brand.findUniqueOrThrow({ where: { id: ctx.brand.id }, select: { timezone: true } });
  const today = dayKey(now, brand.timezone);
  const yearStart = new Date(`${today.slice(0, 4)}-01-01T03:00:00Z`);
  const [paid, account, rejected] = await Promise.all([
    prisma.withdrawal.findMany({ where: { creatorId: ctx.creatorId, brandId: ctx.brand.id, status: "PAID" }, select: { amountCents: true, decidedAt: true } }),
    prisma.creator.findUniqueOrThrow({ where: { id: ctx.creatorId }, select: { account: { select: { pixKey: true } } } }),
    prisma.withdrawal.findMany({ where: { brandId: ctx.brand.id, status: "REJECTED", decidedAt: { gte: new Date(now.getTime() - 180 * DAY) } }, select: { note: true } }),
  ]);
  return {
    today,
    window: withdrawalWindow(today, ctx.withdrawalDays),
    received: {
      totalCents: paid.reduce((s, w) => s + w.amountCents, 0),
      yearCents: paid.filter((w) => w.decidedAt && w.decidedAt >= yearStart).reduce((s, w) => s + w.amountCents, 0),
      year: today.slice(0, 4),
      count: paid.length,
    },
    pixKey: account.account.pixKey ? maskPix(account.account.pixKey) : null,
    reasons: rejectReasons(rejected.map((r) => r.note), 8).filter((r) => r.count >= 2 && r.reason.length <= 80).slice(0, 4),
  };
}
