import { describe, expect, it } from "vitest";
import { pickerDetail } from "@/lib/creators/picker";

describe("Detalhe da creator no seletor", () => {
  it("mostra cupom, @ e e-mail; esconde o e-mail de importação", () => {
    expect(pickerDetail({ account: { email: "ana@x.com", instagram: "@ana" }, couponAssignments: [{ coupon: { code: "ANA" } }] })).toBe("ANA · @ana · ana@x.com");
    expect(pickerDetail({ account: { email: "abc@import.creatorclub", instagram: null }, couponAssignments: [] })).toBe("");
  });
});
