import type { PrismaClient } from "@/generated/prisma/client";
import { dayKey } from "@/domain";
import type { PortalContext } from "./context";
import { resolvePeriod, type Period } from "./period";

/**
 * Vendas do portal (E7.3, D-SALESVIEW, D-PERIOD): pedidos pagos atribuídos à creator no período escolhido, pelo dia
 * do pagamento no fuso da marca. De cada pedido só número, data do pagamento, base, taxa, comissão e situação;
 * **nenhum dado do cliente**. Pedido de teste fica fora; pedido nunca pago (Pix/boleto expirado) também.
 */

export type SaleStatus = "HELD" | "RELEASED" | "PARTIAL_REFUND" | "REVERSED" | "PENDING_RATE";

export const SALE_STATUS_LABEL: Record<SaleStatus, string> = {
  HELD: "A liberar",
  RELEASED: "Liberada",
  PARTIAL_REFUND: "Estorno parcial",
  REVERSED: "Estornada",
  PENDING_RATE: "Em conferência",
};

export type Sale = {
  orderId: string;
  orderName: string;
  paidAt: Date;
  baseCents: number;
  rateBps: number | null;
  commissionCents: number;
  status: SaleStatus;
  availableAt: Date | null;
};

export type SalesDay = { day: string; count: number; baseCents: number; commissionCents: number };

export type SalesPage = {
  period: Omit<Period, "from" | "to">;
  holdDays: number;
  sales: Sale[];
  days: SalesDay[];
  totals: { count: number; baseCents: number; commissionCents: number; ticketCents: number };
};

export function saleStatus(entries: { amountCents: number; availableAt: Date }[], rateBps: number | null, now: Date): SaleStatus {
  if (rateBps === null) return "PENDING_RATE";
  const net = entries.reduce((s, e) => s + e.amountCents, 0);
  const hadReversal = entries.some((e) => e.amountCents < 0);
  if (hadReversal && net <= 0) return "REVERSED";
  if (hadReversal) return "PARTIAL_REFUND";
  return entries.some((e) => e.amountCents > 0 && e.availableAt > now) ? "HELD" : "RELEASED";
}

export async function portalSales(
  prisma: PrismaClient,
  ctx: PortalContext,
  input: { p?: string; de?: string; ate?: string } = {},
  now = new Date(),
): Promise<SalesPage> {
  const { timezone: tz, commissionHoldDays: holdDays } = await prisma.brand.findUniqueOrThrow({
    where: { id: ctx.brand.id },
    select: { timezone: true, commissionHoldDays: true },
  });
  const { from, to, ...period } = resolvePeriod(input, now, tz);
  const rows = await prisma.orderAttribution.findMany({
    where: { creatorId: ctx.creatorId, brandId: ctx.brand.id, order: { paidAt: { gte: from, lt: to }, test: false } },
    select: {
      rateBps: true,
      order: {
        select: {
          id: true,
          name: true,
          paidAt: true,
          subtotalCents: true,
          ledgerEntries: { where: { creatorId: ctx.creatorId, type: { in: ["COMMISSION", "REVERSAL"] } }, select: { amountCents: true, availableAt: true } },
        },
      },
    },
  });
  const sales = rows
    .map((r): Sale => {
      const entries = r.order.ledgerEntries;
      const held = entries.filter((e) => e.amountCents > 0 && e.availableAt > now).map((e) => e.availableAt.getTime());
      return {
        orderId: r.order.id,
        orderName: r.order.name,
        paidAt: r.order.paidAt!,
        baseCents: r.order.subtotalCents,
        rateBps: r.rateBps,
        commissionCents: entries.reduce((s, e) => s + e.amountCents, 0),
        status: saleStatus(entries, r.rateBps, now),
        availableAt: held.length ? new Date(Math.min(...held)) : null,
      };
    })
    .sort((a, b) => b.paidAt.getTime() - a.paidAt.getTime());

  const byDay = new Map<string, SalesDay>(period.days.map((d) => [d, { day: d, count: 0, baseCents: 0, commissionCents: 0 }]));
  for (const s of sales) {
    const d = byDay.get(dayKey(s.paidAt, tz));
    if (!d) continue;
    if (s.status !== "REVERSED") d.count++;
    d.baseCents += s.baseCents;
    d.commissionCents += s.commissionCents;
  }
  const count = sales.filter((s) => s.status !== "REVERSED").length;
  const baseCents = sales.reduce((s, x) => s + x.baseCents, 0);
  return {
    period,
    holdDays,
    sales,
    days: [...byDay.values()],
    totals: {
      count,
      baseCents,
      commissionCents: sales.reduce((s, x) => s + x.commissionCents, 0),
      ticketCents: count ? Math.round(baseCents / count) : 0,
    },
  };
}
