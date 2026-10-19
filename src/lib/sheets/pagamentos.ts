import type { PrismaClient } from "@/generated/prisma/client";
import { moneyToCents, nextDayKey, normHeader, paymentPeriod, percentToBpsText, PAYMENT_TOLERANCE_CENTS, sheetText, startOfLocalDay } from "@/domain";
import { brandOf } from "./central";

/**
 * Planilha "Pagamentos influencers" lida pelo sistema, só leitura e só conferência (D-SHEETREADONLY, S3). Nada de
 * dinheiro muda: cada linha (aba = período) é guardada e comparada com o que o sistema calculou para o mesmo cupom no
 * mesmo período (vendas pelo pagamento do pedido, D-MONTH; comissão pelo extrato). O Pix não é guardado.
 */

const SHEET = "pagamentos";
const PAID = ["PAID", "PARTIALLY_REFUNDED"];

export type PagamentosReadRow = { tab: string; row: number; values: Record<string, unknown> };
type Line = { tab: string; row: number; from: string; to: string; name: string; coupon: string; salesCents: number | null; rateBps: number | null; payCents: number | null };

const COLUMNS: Record<string, "name" | "coupon" | "sales" | "rate" | "pay"> = {
  "NOME COMPLETO": "name",
  NOME: "name",
  CUPOM: "coupon",
  "VALOR EM VENDAS": "sales",
  "% COMISSAO": "rate",
  "TOTAL A SER PAGO": "pay",
};

export async function readPagamentos(prisma: PrismaClient, slug: string, rows: PagamentosReadRow[], now = new Date()) {
  const brandId = await brandOf(prisma, slug);
  const lines: Line[] = [];
  let skipped = 0;
  for (const r of rows.slice(0, 5000)) {
    const period = paymentPeriod(r.tab, now);
    const f: Partial<Record<(typeof COLUMNS)[string], unknown>> = {};
    for (const [h, v] of Object.entries(r.values ?? {})) {
      const k = COLUMNS[normHeader(h)];
      if (k && f[k] === undefined) f[k] = v;
    }
    const coupon = sheetText(f.coupon, 40)?.toUpperCase().replace(/\s+/g, "");
    if (!coupon) continue;
    if (!period) {
      skipped++;
      continue;
    }
    lines.push({
      tab: r.tab,
      row: r.row,
      ...period,
      name: sheetText(f.name, 120) ?? coupon,
      coupon,
      salesCents: moneyToCents(f.sales),
      rateBps: percentToBpsText(f.rate),
      payCents: moneyToCents(f.pay),
    });
  }
  await prisma.sheetSync.upsert({
    where: { brandId_sheet: { brandId, sheet: SHEET } },
    create: { brandId, sheet: SHEET, lastPushAt: now, snapshot: { lines } },
    update: { lastPushAt: now, snapshot: { lines } },
  });
  return { rows: lines.length, skipped, tabs: new Set(lines.map((l) => l.tab)).size };
}

export type PaymentCheckRow = Line & {
  creatorName: string | null;
  creatorId: string | null;
  system: { salesCents: number; orders: number; commissionCents: number; rates: number[] } | null;
  issues: string[];
};

/** Linhas da planilha com o que o sistema calculou e as diferenças (aba mais nova primeiro). */
export async function paymentsCheck(prisma: PrismaClient, brandId: string) {
  const [sync, brand] = await Promise.all([
    prisma.sheetSync.findUnique({ where: { brandId_sheet: { brandId, sheet: SHEET } }, select: { snapshot: true, lastPushAt: true } }),
    prisma.brand.findUniqueOrThrow({ where: { id: brandId }, select: { timezone: true } }),
  ]);
  const lines = ((sync?.snapshot ?? null) as { lines?: Line[] } | null)?.lines ?? [];
  const coupons = await prisma.coupon.findMany({
    where: { brandId, code: { in: [...new Set(lines.map((l) => l.coupon))] } },
    select: { id: true, code: true, assignments: { orderBy: { validFrom: "desc" }, take: 1, select: { creatorId: true, creator: { select: { account: { select: { name: true } } } } } } },
  });
  const byCode = new Map(coupons.map((c) => [c.code, c]));
  const out: PaymentCheckRow[] = [];
  for (const l of lines) {
    const c = byCode.get(l.coupon);
    if (!c) {
      out.push({ ...l, creatorName: null, creatorId: null, system: null, issues: ["cupom não está no sistema"] });
      continue;
    }
    const gte = startOfLocalDay(l.from, brand.timezone);
    const lt = startOfLocalDay(nextDayKey(l.to), brand.timezone);
    const atts = await prisma.orderAttribution.findMany({
      where: { brandId, couponId: c.id, order: { paidAt: { gte, lt }, financialStatus: { in: PAID }, cancelledAt: null, test: false } },
      select: { orderId: true, rateBps: true, order: { select: { subtotalCents: true } } },
    });
    const ledger = atts.length
      ? await prisma.ledgerEntry.aggregate({ where: { brandId, orderId: { in: atts.map((a) => a.orderId) }, type: { in: ["COMMISSION", "REVERSAL"] } }, _sum: { amountCents: true } })
      : null;
    const system = {
      salesCents: atts.reduce((s, a) => s + Math.max(0, a.order.subtotalCents), 0),
      orders: atts.length,
      commissionCents: ledger?._sum.amountCents ?? 0,
      rates: [...new Set(atts.map((a) => a.rateBps).filter((r): r is number => r !== null))],
    };
    const issues: string[] = [];
    const far = (a: number | null, b: number) => a !== null && Math.abs(a - b) > PAYMENT_TOLERANCE_CENTS;
    if (far(l.salesCents, system.salesCents)) issues.push("vendas diferentes");
    if (l.rateBps !== null && system.rates.length && system.rates.some((r) => r !== l.rateBps)) issues.push("% diferente");
    if (far(l.payCents, system.commissionCents)) issues.push("comissão diferente");
    const owner = c.assignments[0];
    out.push({ ...l, creatorId: owner?.creatorId ?? null, creatorName: owner?.creator.account.name ?? null, system, issues });
  }
  out.sort((a, b) => b.to.localeCompare(a.to) || a.row - b.row);
  return { lastReadAt: sync?.lastPushAt ?? null, rows: out };
}
