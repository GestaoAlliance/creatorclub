import type { PrismaClient } from "@/generated/prisma/client";

/**
 * Último pedido de cada creator (D-LASTORDER), para a equipe ver na lista: o pedido elegível (pago ou parcialmente
 * reembolsado, não cancelado, não teste) mais recente com um cupom dela, dentro do período em que o cupom era dela.
 * Conta mesmo com a dona ainda a confirmar (a atribuição só acontece depois da confirmação).
 */
export async function lastOrderFor(prisma: PrismaClient, creatorIds: string[]): Promise<Map<string, { name: string; paidAt: Date }>> {
  if (creatorIds.length === 0) return new Map();
  const rows = await prisma.$queryRaw<{ creatorId: string; name: string; paidAt: Date }[]>`
    SELECT DISTINCT ON (a."creatorId") a."creatorId", o.name, o."paidAt"
    FROM "CouponAssignment" a
    JOIN "Coupon" c ON c.id = a."couponId"
    JOIN "Order" o ON o."brandId" = a."brandId"
      AND upper(c.code) = ANY (SELECT upper(x) FROM unnest(o."discountCodes") x)
    WHERE a."creatorId" = ANY(${creatorIds})
      AND o."paidAt" IS NOT NULL AND o."paidAt" >= a."validFrom" AND (a."validTo" IS NULL OR o."paidAt" < a."validTo")
      AND o."financialStatus" IN ('PAID', 'PARTIALLY_REFUNDED') AND o."cancelledAt" IS NULL AND o.test = false
    ORDER BY a."creatorId", o."paidAt" DESC`;
  return new Map(rows.map((r) => [r.creatorId, { name: r.name, paidAt: r.paidAt }]));
}
