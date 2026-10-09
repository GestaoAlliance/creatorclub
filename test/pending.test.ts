import { describe, expect, it } from "vitest";
import { attributeOrder, isPending, PolicyError, rateAt, type CouponAssignment } from "../src/domain";
import { BRAND, T, assignments, policies } from "./helpers";

const input = (codes: string[]) => ({ brandId: BRAND, discountCodes: codes, orderCreatedAt: T("2026-09-01T12:00:00Z") });

const unconfirmedOwner: CouponAssignment = {
  couponId: "c-cia", brandId: BRAND, code: "CIA", kind: "CREATOR", creatorId: "cia", confirmed: false,
  validFrom: T("2026-01-01T00:00:00Z"), validTo: null,
};
const unclassified: CouponAssignment = {
  couponId: "c-x", brandId: BRAND, code: "NOVO10", kind: null, creatorId: null, confirmed: false,
  validFrom: T("2026-01-01T00:00:00Z"), validTo: null,
};

describe("D-RATEIMPORT: o que não está confirmado não entra em cálculo", () => {
  it("cupom sem tipo antes do cupom de creator deixa o pedido pendente (não pula para o próximo)", () => {
    const r = attributeOrder(input(["NOVO10", "ANA"]), [...assignments, unclassified]);
    expect(isPending(r) && r).toMatchObject({ pending: true, code: "NOVO10", reason: "unclassified" });
  });

  it("cupom desconhecido antes do cupom de creator deixa o pedido pendente", () => {
    const r = attributeOrder(input(["XPTO", "ANA"]), assignments);
    expect(isPending(r) && r).toMatchObject({ code: "XPTO", reason: "unknown_coupon" });
  });

  it("dona a confirmar deixa o pedido pendente", () => {
    const r = attributeOrder(input(["CIA"]), [...assignments, unconfirmedOwner]);
    expect(isPending(r) && r).toMatchObject({ code: "CIA", reason: "owner_unconfirmed" });
  });

  it("cupom de creator confirmado antes do não classificado decide normalmente", () => {
    const r = attributeOrder(input(["ANA", "NOVO10"]), [...assignments, unclassified]);
    expect(r).toMatchObject({ creatorId: "ana", code: "ANA" });
  });

  it("PROMO classificado continua sendo pulado", () => {
    expect(attributeOrder(input(["BOTANIKA", "ANA"]), assignments)).toMatchObject({ creatorId: "ana" });
    expect(attributeOrder(input(["BOTANIKA"]), assignments)).toBeNull();
  });

  it("taxa a confirmar nunca vira número", () => {
    const pending = [{ id: "p-cia", creatorId: "cia", rateBps: 1500, validFrom: T("2026-01-01T00:00:00Z"), validTo: null, confirmed: false }];
    expect(() => rateAt([...policies, ...pending], "cia", T("2026-09-01T12:00:00Z"))).toThrow(PolicyError);
    expect(() => rateAt([...policies, ...pending], "cia", T("2026-09-01T12:00:00Z"))).toThrow(/a confirmar/);
  });
});
