import type { PrismaClient } from "@/generated/prisma/client";
import { isUgcOnly, withdrawBlockReasons, type WithdrawBlockReason } from "@/domain";
import { availableBalances } from "@/lib/commission/release";
import { pendingContract } from "@/lib/contracts/sign";
import { currentTerms } from "@/lib/terms/terms";

export type WithdrawBlock = { availableCents: number; reasons: WithdrawBlockReason[] };

/**
 * D-CANTWITHDRAW: quem da marca tem saldo liberado e não consegue pedir o saque, e por quê (mesmas travas do pedido:
 * acesso, contrato, termo e saldo em conferência). Desligada e só UGC ficam de fora. `ids` limita a algumas creators.
 */
export async function withdrawBlocks(prisma: PrismaClient, brandId: string, now = new Date(), ids?: string[]): Promise<Map<string, WithdrawBlock>> {
  const brand = await prisma.brand.findUniqueOrThrow({ where: { id: brandId }, select: { id: true, timezone: true } });
  const creators = (
    await prisma.creator.findMany({
      where: { brandId, status: { not: "DEACTIVATED" }, ...(ids ? { id: { in: ids } } : {}) },
      select: { id: true, categories: true, withdrawalsUnlockedAt: true, awaitingContractAt: true, contractRequiredAt: true, account: { select: { userId: true } }, _count: { select: { contractSignatures: true } } },
    })
  ).filter((c) => !isUgcOnly(c.categories));
  // Primeiro as travas (consulta leve); o saldo (todo o extrato) só de quem tem alguma (D-EGRESS).
  const terms = await currentTerms(prisma, brandId);
  const accepted = terms && creators.length
    ? new Set((await prisma.termsAcceptance.findMany({ where: { termsVersionId: terms.id, creatorId: { in: creators.map((c) => c.id) } }, select: { creatorId: true } })).map((a) => a.creatorId))
    : null;
  const blocked: { id: string; reasons: WithdrawBlockReason[] }[] = [];
  for (const c of creators) {
    // O contrato do portal só pesa quando há texto publicado para o tipo dela (a mesma regra do portão do portal).
    const contractPending = Boolean(c.contractRequiredAt && c._count.contractSignatures === 0 && (await pendingContract(prisma, { creatorId: c.id }, now)));
    const reasons = withdrawBlockReasons({
      hasLogin: c.account.userId !== null,
      awaitingContract: c.awaitingContractAt !== null,
      contractPending,
      termsPending: accepted !== null && !accepted.has(c.id),
      unlocked: c.withdrawalsUnlockedAt !== null,
    });
    if (reasons.length) blocked.push({ id: c.id, reasons });
  }
  const balances = await availableBalances(prisma, blocked.map((b) => b.id), brand.timezone, now);
  const out = new Map<string, WithdrawBlock>();
  for (const b of blocked) {
    const availableCents = balances.get(b.id) ?? 0;
    if (availableCents > 0) out.set(b.id, { availableCents, reasons: b.reasons });
  }
  return out;
}
