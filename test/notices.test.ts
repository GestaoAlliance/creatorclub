import { describe, expect, it } from "vitest";
import { notices } from "@/domain";

describe("textos dos avisos (U5)", () => {
  it("chaves que não repetem e links do portal", () => {
    expect(notices.commissionReleased("2026-10")).toMatchObject({ kind: "COMMISSION_RELEASED", dedupeKey: "release:2026-10", path: "/saque" });
    expect(notices.commissionReleased("2026-10").body).toContain("outubro de 2026");
    expect(notices.kitAvailable("MONTHLY", "2026-10", 1)).toMatchObject({ dedupeKey: "kit:MONTHLY:2026-10", title: "Você ganhou 1 suplemento", path: "/envios" });
    expect(notices.kitAvailable("WELCOME", "2026-10", 3).title).toBe("Seu kit de boas-vindas: 3 suplementos");
    expect(notices.shipped("s1", "Correios", "AA1BR")).toMatchObject({ dedupeKey: "shipped:s1", body: expect.stringContaining("AA1BR") });
    expect(notices.withdrawalPaid("w1", 123_450).body).toContain("R$ 1.234,50");
    expect(notices.firstSale()).toMatchObject({ dedupeKey: "first-sale", path: "/vendas" });
  });

  it("motivo da recusa termina com ponto uma vez só", () => {
    expect(notices.withdrawalRejected("w", 100, "NF sem CNPJ").body).toContain("Motivo: NF sem CNPJ. O valor");
    expect(notices.withdrawalRejected("w", 100, "NF sem CNPJ.").body).toContain("Motivo: NF sem CNPJ. O valor");
  });
});
