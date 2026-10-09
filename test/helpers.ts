import {
  attributeOrder,
  computeCommissionEntry,
  isPending,
  rateAt,
  type Attribution,
  type CommissionPolicy,
  type CouponAssignment,
  type LedgerEntryDraft,
  type OrderSnapshot,
} from "../src/domain";

/**
 * Pipeline em memória que imita o processamento de um pedido:
 * atribuição decidida uma vez, taxa congelada no pagamento, lançamento
 * incremental com chave de idempotência única (como o índice no banco).
 */
export type Order = OrderSnapshot & { brandId: string; discountCodes: string[]; createdAt: Date };

export class InMemoryPipeline {
  attributions = new Map<string, Attribution & { rateBps: number | null }>();
  ledger: LedgerEntryDraft[] = [];
  private keys = new Set<string>();

  constructor(
    private assignments: CouponAssignment[],
    private policies: CommissionPolicy[],
    private holdDays = 0,
  ) {}

  process(order: Order, now = order.version): LedgerEntryDraft | null {
    let attribution = this.attributions.get(order.id);
    if (!attribution) {
      const decided = attributeOrder(
        { brandId: order.brandId, discountCodes: order.discountCodes, orderCreatedAt: order.createdAt },
        this.assignments,
      );
      if (!decided || isPending(decided)) return null; // pendente: decide de novo depois da confirmação
      attribution = { ...decided, rateBps: null };
      this.attributions.set(order.id, attribution);
    }
    if (attribution.rateBps === null && order.paidAt) {
      attribution.rateBps = rateAt(this.policies, attribution.creatorId, order.paidAt);
    }
    if (attribution.rateBps === null) return null;

    const postedCents = this.ledger
      .filter((e) => e.orderId === order.id)
      .reduce((sum, e) => sum + e.amountCents, 0);
    const entry = computeCommissionEntry({
      order,
      frozenRateBps: attribution.rateBps,
      postedCents,
      holdDays: this.holdDays,
      now,
    });
    if (!entry || this.keys.has(entry.idempotencyKey)) return null;
    this.keys.add(entry.idempotencyKey);
    this.ledger.push(entry);
    return entry;
  }

  balanceOf(creatorId: string): number {
    return this.ledger
      .filter((e) => this.attributions.get(e.orderId)?.creatorId === creatorId)
      .reduce((sum, e) => sum + e.amountCents, 0);
  }
}

export const T = (iso: string) => new Date(iso);

export const BRAND = "botanika";

export const assignments: CouponAssignment[] = [
  { couponId: "c-ana", brandId: BRAND, code: "ANA", kind: "CREATOR", creatorId: "ana", confirmed: true, validFrom: T("2026-01-01T00:00:00Z"), validTo: null },
  { couponId: "c-bia", brandId: BRAND, code: "BIA", kind: "CREATOR", creatorId: "bia", confirmed: true, validFrom: T("2026-01-01T00:00:00Z"), validTo: null },
  { couponId: "c-promo", brandId: BRAND, code: "BOTANIKA", kind: "PROMO", creatorId: null, confirmed: true, validFrom: T("2026-01-01T00:00:00Z"), validTo: null },
];

export const policies: CommissionPolicy[] = [
  { id: "p-ana", creatorId: "ana", rateBps: 1500, validFrom: T("2026-01-01T00:00:00Z"), validTo: null, confirmed: true },
  { id: "p-bia-1", creatorId: "bia", rateBps: 1000, validFrom: T("2026-01-01T00:00:00Z"), validTo: T("2026-09-15T03:00:00Z"), confirmed: true },
  { id: "p-bia-2", creatorId: "bia", rateBps: 1500, validFrom: T("2026-09-15T03:00:00Z"), validTo: null, confirmed: true },
];

export function order(overrides: Partial<Order> & { id: string }): Order {
  return {
    brandId: BRAND,
    financialStatus: "PAID",
    cancelledAt: null,
    test: false,
    subtotalCents: 20_000,
    paidAt: T("2026-09-01T12:00:00Z"),
    createdAt: T("2026-09-01T11:59:00Z"),
    version: T("2026-09-01T12:00:00Z"),
    discountCodes: ["ANA"],
    ...overrides,
  };
}
