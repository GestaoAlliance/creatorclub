import type { PrismaClient } from "@/generated/prisma/client";
import { notices } from "@/domain";
import { notify } from "@/lib/notifications/notify";

/**
 * D-TRACKING: 10 dias depois do envio sem "Recebi", a creator recebe "Seus produtos chegaram?" (uma vez por envio).
 * Só envios de até 14 dias, para quem já está parado há muito tempo não receber avisos velhos de uma vez.
 */
export const RECEIPT_CHECK_DAYS = 10;
const DAY = 86_400_000;

export async function remindReceipts(prisma: PrismaClient, now = new Date()): Promise<number> {
  const rows = await prisma.shipment.findMany({
    where: { status: "SHIPPED", shippedAt: { lte: new Date(now.getTime() - RECEIPT_CHECK_DAYS * DAY), gte: new Date(now.getTime() - 14 * DAY) } },
    select: { id: true, brandId: true, creatorId: true },
    take: 200,
  });
  if (!rows.length) return 0;
  return notify(prisma, rows.map((s) => ({ brandId: s.brandId, creatorId: s.creatorId, notice: notices.receiptCheck(s.id) })));
}
