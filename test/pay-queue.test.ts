import { describe, expect, it } from "vitest";
import { buildQueue, queueCounts } from "@/lib/payouts/queue";
import type { CheckRow } from "@/lib/payouts/check";
import type { PayRow } from "@/lib/payouts/month-board";

const check = (id: string, o: Partial<CheckRow> = {}): CheckRow => ({
  creatorId: id, name: id, phone: null, hasPix: true, month: "2026-10", salesCents: 100_000, rateBps: 1500, expectedCents: 15_000, commissionCents: 15_000,
  systemCents: 15_000, withdrawal: null, matches: true, reasons: [], check: null, ...o,
});
const pay = (id: string, creatorId: string, o: Partial<PayRow> = {}): PayRow => ({
  key: `w:${id}`, withdrawalId: id, creatorId, month: "2026-10", name: creatorId, document: null, pixKey: null, salesCents: 0, rateBps: null, commissionCents: 0,
  nfCents: 15_000, diff: [], requestedAt: null, approvedAt: null, paidAt: null, paidDay: null, paidBy: null, pixReference: null, hasNf: true, nfCheck: "OK",
  legacy: false, note: null, remittanceNsa: null, canApprove: true, canPay: false, inBank: false, bankRejected: null, pixChangedAfterBank: false, ...o,
});
const done = { status: "CHECKED" as const, amountCents: 15_000, stale: false, at: new Date(), by: "Fátima", note: null };

describe("fila de pagamentos (D-PAYQUEUE)", () => {
  it("cada creator numa etapa, na ordem do processo", () => {
    const q = buildQueue({
      check: [
        check("Bia"), // não conferida
        check("Ana", { check: done }), // conferida, sem pedido
        check("Caio", { check: done, withdrawal: { id: "w1", status: "REQUESTED" } }), // conferida, pediu
        check("Duda", { withdrawal: { id: "w2", status: "REQUESTED" } }), // pediu sem conferir
        check("Eva", { check: done, withdrawal: { id: "w3", status: "APPROVED" } }),
      ],
      aprovar: [pay("w1", "Caio"), pay("w2", "Duda")],
      pagar: [pay("w3", "Eva", { canApprove: false, canPay: true })],
      pagos: [pay("w0", "Fabi", { canApprove: false, paidDay: "2026-11-20" })],
    });
    expect(q.map((i) => [i.name, i.stage])).toEqual([["Bia", "conferir"], ["Duda", "conferir"], ["Ana", "pedir"], ["Caio", "aprovar"], ["Eva", "pagar"], ["Fabi", "pago"]]);
    // O pedido de quem ainda não foi conferida segue junto, para abrir a nota.
    expect(q.find((i) => i.name === "Duda")!.pay?.withdrawalId).toBe("w2");
    expect(queueCounts(q).conferir).toEqual({ count: 2, cents: 30_000 });
  });

  it("conferência que ficou velha (valor mudou) volta para conferir", () => {
    const q = buildQueue({ check: [check("Ana", { check: { ...done, stale: true } })], aprovar: [], pagar: [], pagos: [] });
    expect(q[0]!.stage).toBe("conferir");
  });
});
