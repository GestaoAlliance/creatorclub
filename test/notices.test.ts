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

describe("avisos por data e e-mail (U5b)", () => {
  it("textos e chaves", async () => {
    const { noticeEmail } = await import("@/domain");
    const { siteOrigin } = await import("@/lib/notifications/scheduled");
    expect(notices.withdrawalWindow("2026-11", 10, 12_345, false)).toMatchObject({ dedupeKey: "window:2026-11:open", body: expect.stringContaining("R$ 123,45") });
    expect(notices.withdrawalWindow("2026-11", 10, 1, true).dedupeKey).toBe("window:2026-11:last");
    expect(notices.contractEnding("2026-11-20").body).toContain("20/11/2026");
    const e = noticeEmail({ name: "Ana <b>", brandName: "Botanika", title: "Oi & tchau", body: "x", link: "https://x/portal" });
    expect(e.html).toContain("Oi &amp; tchau");
    expect(e.html).not.toContain("<b>");
    expect(siteOrigin({ VERCEL_PROJECT_PRODUCTION_URL: "creatorclub-six.vercel.app" })).toBe("https://creatorclub-six.vercel.app");
    expect(siteOrigin({})).toBeNull();
  });
});
