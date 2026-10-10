import type { PrismaClient } from "@/generated/prisma/client";
import { isInsideWithdrawalWindow, isMonthKey, monthKey, type Balance } from "@/domain";
import { releaseProgress, type ReleaseProgress } from "@/lib/commission/release";
import { readLedger, statementForMonth, type Statement } from "@/lib/commission/statement";
import { PortalError, type PortalContext } from "./context";

/**
 * Aba Saque do portal (E7.4 + E7.7, D-WDTAB): saldo, botão "Solicitar saque", meus saques e movimentações por mês.
 * O botão só funciona quando todas as regras passam (D-WDRULES, D-CONTRACT): saque liberado para a creator (D-WDLOCK,
 * depois do saldo de abertura), janela do mês (NF do dia 1 ao 10), saldo liberado maior que zero (o pedido é sempre do
 * total disponível), um pedido em aberto por vez; e nunca na visualização da equipe.
 */

export type WithdrawalBlock = "LOCKED" | "VIEW_ONLY" | "OUTSIDE_WINDOW" | "NOTHING_AVAILABLE" | "OPEN_REQUEST";

export const WITHDRAWAL_BLOCK_TEXT: Record<WithdrawalBlock, string> = {
  LOCKED: "Seu saldo está em conferência pela equipe. O saque é liberado assim que a conferência terminar.",
  VIEW_ONLY: "Visualização da equipe: nada é pedido em nome da creator.",
  OUTSIDE_WINDOW: "Os pedidos de saque abrem do dia {start} ao dia {end} de cada mês, com a nota fiscal do valor total liberado.",
  NOTHING_AVAILABLE: "Você ainda não tem comissão liberada. A comissão é liberada no fechamento do mês (dia 1) quando suas vendas acumuladas chegam a {min}.",
  OPEN_REQUEST: "Você já tem um pedido de saque em análise. Assim que ele for concluído, pode pedir outro.",
};

export const WITHDRAWAL_STATUS_LABEL = { REQUESTED: "Em análise", PAID: "Pago", REJECTED: "Recusado", CANCELLED: "Cancelado" } as const;

export type WithdrawalTab = {
  balance: Balance;
  release: ReleaseProgress;
  policy: { windowStartDay: number; windowEndDay: number };
  /** Dados para emitir a nota antes de pedir (D-NF): CNPJ do tomador e a sugestão de descrição/código. */
  nf: { takerDocument: string | null; instructions: string | null };
  /** D-PFRECEIPT: recebe como pessoa física (recibo no lugar da nota). */
  individual: boolean;
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
      select: {
        timezone: true,
        withdrawalWindowStartDay: true,
        withdrawalWindowEndDay: true,
        nfTakerDocument: true,
        nfInstructions: true,
      },
    }),
    prisma.creator.findUniqueOrThrow({ where: { id: ctx.creatorId }, select: { withdrawalsUnlockedAt: true, receivesAsIndividual: true } }),
    prisma.withdrawal.findMany({
      where: { creatorId: ctx.creatorId, brandId: ctx.brand.id },
      orderBy: { requestedAt: "desc" },
      select: { id: true, requestedAt: true, amountCents: true, status: true, decidedAt: true, note: true },
    }),
  ]);
  const [ledger, release] = await Promise.all([
    readLedger(prisma, { id: ctx.creatorId, brandId: ctx.brand.id, brand: { timezone: brand.timezone } }, now),
    releaseProgress(prisma, ctx.creatorId, now),
  ]);
  const policy = { windowStartDay: brand.withdrawalWindowStartDay, windowEndDay: brand.withdrawalWindowEndDay };

  const blocks: WithdrawalBlock[] = [];
  if (ctx.viewAs) blocks.push("VIEW_ONLY");
  if (!creator.withdrawalsUnlockedAt) blocks.push("LOCKED");
  if (!isInsideWithdrawalWindow(now, { ...policy, timeZone: brand.timezone })) blocks.push("OUTSIDE_WINDOW");
  if (ledger.balance.availableCents <= 0) blocks.push("NOTHING_AVAILABLE");
  if (withdrawals.some((w) => w.status === "REQUESTED")) blocks.push("OPEN_REQUEST");

  return {
    balance: ledger.balance,
    release,
    policy,
    nf: { takerDocument: brand.nfTakerDocument, instructions: brand.nfInstructions },
    individual: creator.receivesAsIndividual,
    blocks,
    withdrawals,
    statement: statementForMonth(ledger, opts.month, monthKey(now, brand.timezone)),
  };
}
