import { describe, expect, it } from "vitest";
import { rejectionMessage, welcomeMessage, whatsappLink } from "@/domain";

describe("mensagens prontas de WhatsApp (F3)", () => {
  it("link wa.me: número brasileiro com ou sem 55; sem número utilizável, nada", () => {
    expect(whatsappLink("(11) 91234-5678", "oi")).toBe("https://wa.me/5511912345678?text=oi");
    expect(whatsappLink("+55 11 3456-7890", "a b")).toBe("https://wa.me/551134567890?text=a%20b");
    expect(whatsappLink("011 91234-5678", "x")).toBe("https://wa.me/5511912345678?text=x");
    expect(whatsappLink("1234", "x")).toBeNull();
    expect(whatsappLink(null, "x")).toBeNull();
  });

  it("boas-vindas com cupom, desconto e convite; resposta de recusa gentil", () => {
    const w = welcomeMessage({ name: "  Maria Exemplo ", brand: "Botanika", coupon: "MARIA", discountBps: 750, inviteLink: "https://x/convite/abc" });
    expect(w).toContain("Oi, Maria!");
    expect(w).toContain("*MARIA*");
    expect(w).toContain("7,5% de desconto");
    expect(w).toContain("https://x/convite/abc");
    expect(welcomeMessage({ name: "Ana", brand: "Botanika", coupon: "ANA", discountBps: 500, inviteLink: null })).not.toContain("convite");
    const r = rejectionMessage({ name: "Ana Souza", brand: "Botanika" });
    expect(r).toContain("Oi, Ana!");
    expect(r).toContain("não vamos seguir");
  });
});
