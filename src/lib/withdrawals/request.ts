import { createHash } from "node:crypto";
import type { PrismaClient } from "@/generated/prisma/client";
import { checkWithdrawalRequest, computeBalance, type WithdrawalError } from "@/domain";
import type { PortalContext } from "@/lib/portal/context";
import { pendingTerms } from "@/lib/terms/terms";

/**
 * Pedido de saque pela creator (E7.7, D-WDRULES). A nota fiscal (PDF até 10 MB) sobe direto do navegador para o
 * bucket privado `nf` por um link assinado; aqui o servidor confere o arquivo e grava o pedido. Tudo numa transação
 * que trava a creator (`FOR UPDATE`), recalcula o saldo e aplica as regras: liberada (D-WDLOCK), janela, mínimo,
 * saldo, um pedido em aberto (índice `Withdrawal_one_open_per_creator`). O mesmo `requestId` nunca cria dois pedidos.
 * O valor só sai do saldo quando o Pagamento marcar como pago (E8); até lá fica "em saque" (reservado).
 */

export class WithdrawalRequestError extends Error {}

export const NF_BUCKET = "nf";
export const MAX_NF_BYTES = 10 * 1024 * 1024;

const RULE_TEXT: Record<WithdrawalError, string> = {
  FORA_DA_JANELA: "Os pedidos de saque abrem só na janela do mês.",
  VALOR_INVALIDO: "Informe um valor válido.",
  ABAIXO_DO_MINIMO: "O valor está abaixo do mínimo por pedido.",
  SALDO_INSUFICIENTE: "O valor é maior que o seu saldo disponível.",
  SAQUE_EM_ABERTO: "Você já tem um pedido de saque em análise.",
};

export function nfPath(brandId: string, creatorId: string, requestId: string): string {
  return `${brandId}/${creatorId}/${requestId}.pdf`;
}

export function assertRequestId(requestId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(requestId)) throw new WithdrawalRequestError("Pedido inválido. Recarregue a página.");
}

/** PDF de verdade: começa com "%PDF-" e cabe no limite. */
export function checkPdf(bytes: Uint8Array) {
  if (bytes.byteLength === 0) throw new WithdrawalRequestError("Envie a nota fiscal em PDF.");
  if (bytes.byteLength > MAX_NF_BYTES) throw new WithdrawalRequestError("A nota fiscal passa de 10 MB.");
  if (Buffer.from(bytes.subarray(0, 5)).toString("latin1") !== "%PDF-") throw new WithdrawalRequestError("O arquivo não é um PDF.");
}

/** Regras que não dependem do valor: visualização da equipe, saque liberado e termo aceito (D-TERMS). */
export async function assertCanStart(prisma: PrismaClient, ctx: PortalContext) {
  if (ctx.viewAs) throw new WithdrawalRequestError("Visualização da equipe: nada é pedido em nome da creator.");
  const creator = await prisma.creator.findUniqueOrThrow({ where: { id: ctx.creatorId }, select: { withdrawalsUnlockedAt: true } });
  if (!creator.withdrawalsUnlockedAt) throw new WithdrawalRequestError("Seu saldo está em conferência; o saque ainda não foi liberado.");
  if (await pendingTerms(prisma, ctx)) throw new WithdrawalRequestError("Aceite o termo do Creator Club antes de pedir saque.");
}

export async function requestWithdrawal(
  prisma: PrismaClient,
  ctx: PortalContext,
  input: { actorUserId: string; requestId: string; amountCents: number; pdf: Uint8Array; pixKey?: string },
  now = new Date(),
): Promise<{ withdrawalId: string; created: boolean }> {
  assertRequestId(input.requestId);
  await assertCanStart(prisma, ctx);
  checkPdf(input.pdf);
  const key = `withdrawal:${input.requestId}`;
  const existing = await prisma.withdrawal.findUnique({ where: { idempotencyKey: key }, select: { id: true, creatorId: true } });
  if (existing) {
    if (existing.creatorId !== ctx.creatorId) throw new WithdrawalRequestError("Pedido inválido. Recarregue a página.");
    return { withdrawalId: existing.id, created: false };
  }

  try {
    return await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Creator" WHERE id = ${ctx.creatorId} FOR UPDATE`;
      // Outro envio do mesmo pedido pode ter terminado enquanto este esperava a trava.
      const again = await tx.withdrawal.findUnique({ where: { idempotencyKey: key }, select: { id: true } });
      if (again) return { withdrawalId: again.id, created: false };
      const creator = await tx.creator.findUniqueOrThrow({
        where: { id: ctx.creatorId },
        include: {
          account: { select: { id: true, pixKey: true } },
          brand: { select: { timezone: true, withdrawalMinCents: true, withdrawalWindowStartDay: true, withdrawalWindowEndDay: true } },
        },
      });
      const [entries, open] = await Promise.all([
        tx.ledgerEntry.findMany({ where: { creatorId: creator.id, brandId: creator.brandId }, select: { type: true, amountCents: true, availableAt: true } }),
        tx.withdrawal.findMany({ where: { creatorId: creator.id, brandId: creator.brandId, status: "REQUESTED" }, select: { amountCents: true } }),
      ]);
      const balance = computeBalance(entries, open, now);
      const errors = checkWithdrawalRequest(
        { amountCents: input.amountCents, availableCents: balance.availableCents, hasOpenWithdrawal: open.length > 0, now },
        {
          minCents: creator.brand.withdrawalMinCents,
          windowStartDay: creator.brand.withdrawalWindowStartDay,
          windowEndDay: creator.brand.withdrawalWindowEndDay,
          timeZone: creator.brand.timezone,
        },
      );
      if (errors.length) throw new WithdrawalRequestError(RULE_TEXT[errors[0]!]);

      const pix = input.pixKey?.trim();
      if (!creator.account.pixKey) {
        if (!pix) throw new WithdrawalRequestError("Informe a chave Pix para receber.");
        await tx.creatorAccount.update({ where: { id: creator.account.id }, data: { pixKey: pix.slice(0, 140) } });
      }

      const file = await tx.file.create({
        data: {
          brandId: creator.brandId,
          bucket: NF_BUCKET,
          path: nfPath(creator.brandId, creator.id, input.requestId),
          mime: "application/pdf",
          sizeBytes: input.pdf.byteLength,
          sha256: createHash("sha256").update(input.pdf).digest("hex"),
          uploadedById: input.actorUserId,
        },
      });
      const withdrawal = await tx.withdrawal.create({
        data: { brandId: creator.brandId, creatorId: creator.id, amountCents: input.amountCents, nfFileId: file.id, idempotencyKey: key, requestedAt: now },
      });
      await tx.auditLog.create({
        data: {
          brandId: creator.brandId,
          actorType: "USER",
          actorId: input.actorUserId,
          action: "withdrawal.request",
          entity: "Withdrawal",
          entityId: withdrawal.id,
          after: { amountCents: input.amountCents, availableCents: balance.availableCents, pixKeySet: !creator.account.pixKey },
        },
      });
      return { withdrawalId: withdrawal.id, created: true };
    });
  } catch (error) {
    if (error instanceof WithdrawalRequestError) throw error;
    if (String(error).includes("Withdrawal_one_open_per_creator")) throw new WithdrawalRequestError(RULE_TEXT.SAQUE_EM_ABERTO);
    throw error;
  }
}
