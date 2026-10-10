import type { PrismaClient } from "@/generated/prisma/client";
import { dayKey, idleStatus } from "@/domain";
import { dayOf } from "./contract";

/**
 * Aviso de 60 dias sem vender (D-IDLE60). Venda = pedido atribuído elegível (pago ou parcialmente reembolsado, não
 * cancelado, não teste), pela data do pagamento. Só creators ativas com contrato de comissão: permuta (UGC, sem
 * comissão) não entra no aviso.
 */

type Db = PrismaClient | Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

/** Data do último pagamento de pedido elegível de cada creator (só quem já vendeu aparece). */
export async function lastSaleAt(prisma: Db, creatorIds: string[]): Promise<Map<string, Date>> {
  if (creatorIds.length === 0) return new Map();
  const rows = await prisma.$queryRaw<{ creatorId: string; last: Date }[]>`
    SELECT a."creatorId", MAX(o."paidAt") AS last
    FROM "OrderAttribution" a JOIN "Order" o ON o.id = a."orderId"
    WHERE a."creatorId" = ANY(${creatorIds}) AND o."paidAt" IS NOT NULL
      AND o."financialStatus" IN ('PAID', 'PARTIALLY_REFUNDED') AND o."cancelledAt" IS NULL AND o.test = false
    GROUP BY a."creatorId"`;
  return new Map(rows.map((r) => [r.creatorId, r.last]));
}

type IdleCreator = {
  id: string;
  status: string;
  createdAt: Date;
  contractStart: Date | null;
  contractTemplate: { releaseMinCents: number | null } | null;
};

/** Situação de "sem vender" de cada creator; `null` = fora do aviso (pausada, desligada ou permuta). */
export async function idleFor(prisma: Db, creators: IdleCreator[], timeZone: string, now = new Date()) {
  const watched = creators.filter((c) => c.status === "ACTIVE" && !(c.contractTemplate && c.contractTemplate.releaseMinCents === null));
  const last = await lastSaleAt(prisma, watched.map((c) => c.id));
  const out = new Map<string, ReturnType<typeof idleStatus> | null>(creators.map((c) => [c.id, null]));
  for (const c of watched) {
    const sale = last.get(c.id);
    out.set(c.id, idleStatus(sale ? dayKey(sale, timeZone) : null, dayOf(c.contractStart) ?? dayKey(c.createdAt, timeZone), now, timeZone));
  }
  return out;
}

export const IDLE_SELECT = { id: true, status: true, createdAt: true, contractStart: true, contractTemplate: { select: { releaseMinCents: true } } } as const;
