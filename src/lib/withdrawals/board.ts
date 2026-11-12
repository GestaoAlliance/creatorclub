import type { PrismaClient } from "@/generated/prisma/client";
import { computeBalance, dayKey, monthKey, rejectReasons, withdrawalDays, withdrawalWindow } from "@/domain";
import type { Actor } from "@/lib/auth/actor";
import { can } from "@/lib/auth/permissions";
import { ledgerEntriesWithMonth, openReservations, releasedThroughFor } from "@/lib/commission/release";

/**
 * Faixa e extras da tela de Saques (D-PAYBOARD, pedido do responsável em 2026-11-12), da marca escolhida no topo:
 * janela de pedido, quem tem saldo para saque e não pediu, saques enviados ao banco, pagos por mês (6 meses) e os
 * motivos de recusa mais comuns (180 dias). Só quem vê saques da marca.
 */

export class PayoutBoardError extends Error {}

const DAY = 86_400_000;

export async function payoutBoard(prisma: PrismaClient, actor: Actor | null, brandId: string, now = new Date()) {
  if (!actor || !can(actor.grants, "withdrawals.view", brandId)) throw new PayoutBoardError("Sem permissão.");
  const brand = await prisma.brand.findUniqueOrThrow({
    where: { id: brandId },
    select: { timezone: true, withdrawalWindowStartDay: true, withdrawalWindowEndDay: true, withdrawalPayFromDay: true, withdrawalPayByDay: true },
  });
  const tz = brand.timezone;
  const days = withdrawalDays(brand);
  const today = dayKey(now, tz);

  const months = Array.from({ length: 6 }, (_, i) => {
    const [y, m] = monthKey(now, tz).split("-").map(Number) as [number, number];
    const d = new Date(Date.UTC(y, m - 1 - (5 - i), 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  });
  const [creators, paid, rejected, inBank] = await Promise.all([
    prisma.creator.findMany({
      where: { brandId, archivedAt: null, withdrawalsUnlockedAt: { not: null }, status: { not: "DEACTIVATED" } },
      select: { id: true, account: { select: { name: true } } },
    }),
    prisma.withdrawal.findMany({ where: { brandId, status: "PAID", decidedAt: { gte: new Date(now.getTime() - 200 * DAY) } }, select: { amountCents: true, decidedAt: true } }),
    prisma.withdrawal.findMany({ where: { brandId, status: "REJECTED", decidedAt: { gte: new Date(now.getTime() - 180 * DAY) } }, select: { note: true } }),
    prisma.withdrawal.aggregate({ where: { brandId, status: "APPROVED", remittanceId: { not: null } }, _sum: { amountCents: true }, _count: true }),
  ]);

  // Saldo para saque de cada creator liberada, já descontado o que está pedido (mesma conta do saldo do portal).
  const ids = creators.map((c) => c.id);
  const [entries, open, released] = ids.length
    ? await Promise.all([ledgerEntriesWithMonth(prisma, ids, tz), openReservations(prisma, { creatorId: { in: ids } }), releasedThroughFor(prisma, ids)])
    : [[], [], new Map<string, string | null>()];
  const notRequested = creators
    .map((c) => {
      const b = computeBalance(entries.filter((e) => e.creatorId === c.id), open.filter((o) => o.creatorId === c.id), now, { releasedThrough: released.get(c.id) ?? null });
      return { id: c.id, name: c.account.name, availableCents: b.availableCents, hasOpen: open.some((o) => o.creatorId === c.id) };
    })
    .filter((c) => c.availableCents > 0 && !c.hasOpen)
    .map(({ hasOpen: _h, ...c }) => c)
    .sort((a, b) => b.availableCents - a.availableCents);

  const byMonth = new Map(months.map((m) => [m, { cents: 0, count: 0 }]));
  for (const w of paid) {
    const b = byMonth.get(monthKey(w.decidedAt!, tz));
    if (!b) continue;
    b.cents += w.amountCents;
    b.count++;
  }

  return {
    today,
    days,
    window: withdrawalWindow(today, days),
    notRequested,
    inBank: { count: inBank._count, cents: inBank._sum.amountCents ?? 0 },
    paidByMonth: months.map((m) => ({ month: m, ...byMonth.get(m)! })),
    reasons: rejectReasons(rejected.map((r) => r.note)),
  };
}
