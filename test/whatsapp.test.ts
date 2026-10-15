import { describe, expect, it } from "vitest";
import { contractSentMessage, welcomeMessage, whatsappLink } from "@/domain";

describe("mensagens prontas de WhatsApp (F3)", () => {
  it("link wa.me: número brasileiro com ou sem 55; sem número utilizável, nada", () => {
    expect(whatsappLink("(11) 91234-5678", "oi")).toBe("https://wa.me/5511912345678?text=oi");
    expect(whatsappLink("+55 11 3456-7890", "a b")).toBe("https://wa.me/551134567890?text=a%20b");
    expect(whatsappLink("011 91234-5678", "x")).toBe("https://wa.me/5511912345678?text=x");
    expect(whatsappLink("1234", "x")).toBeNull();
    expect(whatsappLink(null, "x")).toBeNull();
  });

  it("aprovada com contrato no Autentique: texto da Ana, com marca, tipo, nome e e-mail; propósito só onde existe", () => {
    const b = contractSentMessage({ name: "Vitória Souza", brand: "Botanika", email: "vitoria@x.com", category: "INFLUENCER" });
    expect(b).toContain("Oi, Vitória! Tudo bem? Sou a Ana, da Botanika!");
    expect(b).toContain("sua inscrição para ser influencer da Botanika foi aprovada! 🎉");
    expect(b).toContain("para o seu e-mail (vitoria@x.com), pelo Autentique");
    expect(b).toContain("Nascemos com o propósito de cuidar da saúde das pessoas");
    expect(b.endsWith("Que seja o início de uma parceria incrível! ✨")).toBe(true);
    const v = contractSentMessage({ name: "Ana", brand: "VermeFree", email: "a@x.com", category: "PRESCRITOR" });
    expect(v).toContain("ser prescritor(a) da VermeFree");
    expect(v).toContain("Seja muito bem-vinda à família VermeFree!");
    expect(v).not.toContain("Nascemos");
  });

  it("boas-vindas com cupom, desconto e convite", () => {
    const w = welcomeMessage({ name: "  Maria Exemplo ", brand: "Botanika", coupon: "MARIA", discountBps: 750, inviteLink: "https://x/convite/abc" });
    expect(w).toContain("Oi, Maria!");
    expect(w).toContain("*MARIA*");
    expect(w).toContain("7,5% de desconto");
    expect(w).toContain("https://x/convite/abc");
    expect(welcomeMessage({ name: "Ana", brand: "Botanika", coupon: "ANA", discountBps: 500, inviteLink: null })).not.toContain("convite");
  });
});
