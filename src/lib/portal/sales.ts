import type { PrismaClient } from "@/generated/prisma/client";
import { isMonthKey, monthKey } from "@/domain";
import { PortalError, type PortalContext } from "./context";

/**
 * Vendas do portal (E7.3, D-SALESVIEW): pedidos pagos atribuídos à creator, por mês do pagamento (D-MONTH).
 * De cada pedido só número, data do pagamento, base, taxa, comissão e situação; **nenhum dado do cliente**.
 * Pedido de teste fica fora; pedido nunca pago (Pix/boleto expirado) também.
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

export type SalesPage = {
  month: string;
  months: string[];
  holdDays: number;
  sales: Sale[];
  totals: { count: number; baseCents: number; commissionCents: number };
};

export function saleStatus(entries: { amountCents: number; availableAt: Date }[], rateBps: number | null, now: Date): SaleStatus {
  if (rateBps === null) return "PENDING_RATE";
  const net = entries.reduce((s, e) => s + e.amountCents, 0);
  const hadReversal = entries.some((e) => e.amountCents < 0);
  if (hadReversal && net <= 0) return "REVERSED";
  if (hadReversal) return "PARTIAL_REFUND";
  return entries.some((e) => e.amountCents > 0 && e.availableAt > now) ? "HELD" : "RELEASED";
}

export async function portalSales(prisma: PrismaClient, ctx: PortalContext, opts: { month?: string; now?: Date } = {}): Promise<SalesPage> {
  if (opts.month !== undefined && !isMonthKey(opts.month)) throw new PortalError("Mês inválido.");
  const now = opts.now ?? new Date();
  const { timezone: tz, commissionHoldDays: holdDays } = await prisma.brand.findUniqueOrThrow({
    where: { id: ctx.brand.id },
    select: { timezone: true, commissionHoldDays: true },
  });
  const rows = await prisma.orderAttribution.findMany({
    where: { creatorId: ctx.creatorId, brandId: ctx.brand.id, order: { paidAt: { not: null }, test: false } },
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
  const all = rows.map((r) => ({ ...r, month: monthKey(r.order.paidAt!, tz) }));
  const months = [...new Set(all.map((r) => r.month))].sort().reverse();
  const month = opts.month ?? months[0] ?? monthKey(now, tz);
  const sales = all
    .filter((r) => r.month === month)
    .map((r): Sale => {
      const entries = r.order.ledgerEntries;
      const status = saleStatus(entries, r.rateBps, now);
      const held = entries.filter((e) => e.amountCents > 0 && e.availableAt > now).map((e) => e.availableAt.getTime());
      return {
        orderId: r.order.id,
        orderName: r.order.name,
        paidAt: r.order.paidAt!,
        baseCents: r.order.subtotalCents,
        rateBps: r.rateBps,
        commissionCents: entries.reduce((s, e) => s + e.amountCents, 0),
        status,
        availableAt: held.length ? new Date(Math.min(...held)) : null,
      };
    })
    .sort((a, b) => b.paidAt.getTime() - a.paidAt.getTime());
  return {
    month,
    months,
    holdDays,
    sales,
    totals: {
      count: sales.filter((s) => s.status !== "REVERSED").length,
      baseCents: sales.reduce((s, x) => s + x.baseCents, 0),
      commissionCents: sales.reduce((s, x) => s + x.commissionCents, 0),
    },
  };
}
