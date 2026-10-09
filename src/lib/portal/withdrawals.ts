import type { PrismaClient } from "@/generated/prisma/client";
import { isInsideWithdrawalWindow, isMonthKey, monthKey, type Balance } from "@/domain";
import { readLedger, statementForMonth, type Statement } from "@/lib/commission/statement";
import { PortalError, type PortalContext } from "./context";

/**
 * Aba Saque do portal (E7.4 + E7.7, D-WDTAB): saldo, botão "Solicitar saque", meus saques e movimentações por mês.
 * O botão só funciona quando todas as regras passam (D-WDRULES): saque liberado para a creator (D-WDLOCK, depois do
 * saldo de abertura), janela do mês, mínimo por pedido, um pedido em aberto por vez; e nunca na visualização da equipe.
 */

export type WithdrawalBlock = "LOCKED" | "VIEW_ONLY" | "OUTSIDE_WINDOW" | "BELOW_MIN" | "OPEN_REQUEST";

export const WITHDRAWAL_BLOCK_TEXT: Record<WithdrawalBlock, string> = {
  LOCKED: "Seu saldo está em conferência pela equipe. O saque é liberado assim que a conferência terminar.",
  VIEW_ONLY: "Visualização da equipe: nada é pedido em nome da creator.",
  OUTSIDE_WINDOW: "Os pedidos de saque abrem do dia {start} ao dia {end} de cada mês.",
  BELOW_MIN: "O saque mínimo é de {min}. Assim que seu saldo disponível chegar lá, o botão libera.",
  OPEN_REQUEST: "Você já tem um pedido de saque em análise. Assim que ele for concluído, pode pedir outro.",
};

export const WITHDRAWAL_STATUS_LABEL = { REQUESTED: "Em análise", PAID: "Pago", REJECTED: "Recusado", CANCELLED: "Cancelado" } as const;

export type WithdrawalTab = {
  balance: Balance;
  nextReleaseAt: Date | null;
  policy: { minCents: number; windowStartDay: number; windowEndDay: number };
  blocks: WithdrawalBlock[];
  withdrawals: { id: string; requestedAt: Date; amountCents: number; status: keyof typeof WITHDRAWAL_STATUS_LABEL; decidedAt: Date | null; note: string | null }[];
  statement: Statement;
};

export async function portalWithdrawalTab(
  prisma: PrismaClient,
  ctx: PortalContext,
  opts: { month?: string; now?: Date } = {},
): Promise<WithdrawalTab> {
  if (opts.month !== undefined && !isMonthKey(opts.month)) throw new PortalError("Mês inválido.");
  const now = opts.now ?? new Date();
  const [brand, creator, withdrawals] = await Promise.all([
    prisma.brand.findUniqueOrThrow({
      where: { id: ctx.brand.id },
      select: { timezone: true, commissionHoldDays: true, withdrawalMinCents: true, withdrawalWindowStartDay: true, withdrawalWindowEndDay: true },
    }),
    prisma.creator.findUniqueOrThrow({ where: { id: ctx.creatorId }, select: { withdrawalsUnlockedAt: true } }),
    prisma.withdrawal.findMany({
      where: { creatorId: ctx.creatorId, brandId: ctx.brand.id },
      orderBy: { requestedAt: "desc" },
      select: { id: true, requestedAt: true, amountCents: true, status: true, decidedAt: true, note: true },
    }),
  ]);
  const ledger = await readLedger(prisma, { id: ctx.creatorId, brandId: ctx.brand.id, brand: { timezone: brand.timezone } }, now);
  const policy = { minCents: brand.withdrawalMinCents, windowStartDay: brand.withdrawalWindowStartDay, windowEndDay: brand.withdrawalWindowEndDay };

  const blocks: WithdrawalBlock[] = [];
  if (ctx.viewAs) blocks.push("VIEW_ONLY");
  if (!creator.withdrawalsUnlockedAt) blocks.push("LOCKED");
  if (!isInsideWithdrawalWindow(now, { ...policy, timeZone: brand.timezone })) blocks.push("OUTSIDE_WINDOW");
  if (ledger.balance.availableCents < policy.minCents) blocks.push("BELOW_MIN");
  if (withdrawals.some((w) => w.status === "REQUESTED")) blocks.push("OPEN_REQUEST");

  const held = ledger.lines.filter((l) => l.held).map((l) => l.availableAt.getTime());
  return {
    balance: ledger.balance,
    nextReleaseAt: held.length ? new Date(Math.min(...held)) : null,
    policy,
    blocks,
    withdrawals,
    statement: statementForMonth(ledger, brand.commissionHoldDays, opts.month, monthKey(now, brand.timezone)),
  };
}
