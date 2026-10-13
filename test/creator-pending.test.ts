import { describe, expect, it } from "vitest";
import { creatorPendings } from "@/domain";

const ok = { status: "ACTIVE", reviewed: true, ownerPending: false, ratePending: false, fakeEmail: false, contract: "ACTIVE" as const };

describe("pendências da creator (D-CREATORPENDING)", () => {
  it("sem pendência quando está tudo confirmado", () => {
    expect(creatorPendings(ok)).toEqual([]);
  });

  it("lista cada pendência na ordem de resolver", () => {
    expect(creatorPendings({ ...ok, reviewed: false, ownerPending: true, ratePending: true, fakeEmail: true, contract: "EXPIRED" })).toEqual([
      "dona do cupom a confirmar",
      "taxa a confirmar",
      "números a conferir",
      "e-mail a confirmar",
      "contrato vencido",
    ]);
    expect(creatorPendings({ ...ok, contract: "EXPIRING" })).toEqual(["contrato vencendo"]);
  });

  it("creator desligada não tem pendência", () => {
    expect(creatorPendings({ ...ok, status: "DEACTIVATED", reviewed: false })).toEqual([]);
  });
});
