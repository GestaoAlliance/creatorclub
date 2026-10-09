import type { PrismaClient } from "@/generated/prisma/client";
import { parseDecimalToCents } from "@/domain";
import type { Actor } from "@/lib/auth/actor";
import { can } from "@/lib/auth/permissions";

/**
 * Ajuste manual de saldo (E5.3, D-ADJUST): só super admin, com motivo, valor com sinal (bônus positivo, correção
 * negativa). Vira uma linha própria do extrato (`ADJUSTMENT`), disponível na hora, nunca apagada; corrigir um ajuste
 * é lançar outro. `requestId` (gerado na tela) impede o mesmo envio de lançar duas vezes.
 */

export class AdjustError extends Error {}

export const MIN_REASON = 5;

/** "150", "150,50", "-10,5", "R$ 1.234,56" → centavos com sinal, sem Float. */
export function brlToCents(input: string): number {
  const s = input.replace(/R\$|\s/g, "");
  const negative = s.startsWith("-");
  const digits = s.replace(/^[-+]/, "");
  if (!/^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+(,\d{1,2})?$/.test(digits)) throw new AdjustError("Valor inválido. Use, por exemplo, 150,00 ou -20,50.");
  const cents = parseDecimalToCents(digits.replace(/\./g, "").replace(",", "."));
  return negative ? -cents : cents;
}

export async function createAdjustment(
  prisma: PrismaClient,
  actor: Actor | null,
  input: { creatorId: string; amountCents: number; reason: string; requestId: string },
  now = new Date(),
) {
  const creator = await prisma.creator.findUnique({ where: { id: input.creatorId }, select: { id: true, brandId: true } });
  if (!creator) throw new AdjustError("Creator não encontrada.");
  if (!actor || !can(actor.grants, "ledger.adjust", creator.brandId)) throw new AdjustError("Só super admin ajusta saldo.");
  const reason = input.reason.trim();
  if (reason.length < MIN_REASON) throw new AdjustError("Escreva o motivo do ajuste.");
  if (!Number.isInteger(input.amountCents) || input.amountCents === 0) throw new AdjustError("O valor não pode ser zero.");
  if (!/^[\w-]{8,64}$/.test(input.requestId)) throw new AdjustError("Envio inválido; recarregue a página.");

  return prisma.$transaction(async (tx) => {
    const { count } = await tx.ledgerEntry.createMany({
      data: [
        {
          brandId: creator.brandId,
          creatorId: creator.id,
          type: "ADJUSTMENT",
          amountCents: input.amountCents,
          availableAt: now,
          idempotencyKey: `adjust:${input.requestId}`,
          note: reason,
          createdById: actor.userId,
        },
      ],
      skipDuplicates: true,
    });
    if (count === 0) return { created: false };
    await tx.auditLog.create({
      data: {
        brandId: creator.brandId,
        actorType: "USER",
        actorId: actor.userId,
        action: "ledger.adjust",
        entity: "Creator",
        entityId: creator.id,
        after: { amountCents: input.amountCents, reason },
      },
    });
    return { created: true };
  });
}
