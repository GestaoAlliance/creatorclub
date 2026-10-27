import { describe, expect, it } from "vitest";
import { configuredWhatsApp, inWhatsAppHours, n8nSender, whatsappText } from "@/lib/notifications/whatsapp";

describe("avisos pelo WhatsApp (M2.2, D-WHATSAPP)", () => {
  it("só das 9h às 20h de São Paulo", () => {
    expect(inWhatsAppHours(new Date("2026-10-22T11:59:00Z"))).toBe(false); // 8h59
    expect(inWhatsAppHours(new Date("2026-10-22T12:00:00Z"))).toBe(true); // 9h
    expect(inWhatsAppHours(new Date("2026-10-22T22:59:00Z"))).toBe(true); // 19h59
    expect(inWhatsAppHours(new Date("2026-10-22T23:00:00Z"))).toBe(false); // 20h
  });

  it("texto: título em negrito, corpo e link", () => {
    expect(whatsappText({ title: "Saque pago", body: "O Pix caiu." }, "https://x.test/portal/botanika/saque")).toBe("*Saque pago*\n\nO Pix caiu.\n\nhttps://x.test/portal/botanika/saque");
  });

  it("só liga com endereço https e senha de 32 ou mais; manda com a senha no cabeçalho", async () => {
    const secret = "s".repeat(32);
    expect(configuredWhatsApp({})).toBeNull();
    expect(configuredWhatsApp({ N8N_NOTICES_URL: "https://n8n.test/webhook/x", N8N_NOTICES_SECRET: "curta" })).toBeNull();
    expect(configuredWhatsApp({ N8N_NOTICES_URL: "http://n8n.test/webhook/x", N8N_NOTICES_SECRET: secret })).toBeNull();
    expect(configuredWhatsApp({ N8N_NOTICES_URL: "https://n8n.test/webhook/x", N8N_NOTICES_SECRET: secret })).not.toBeNull();
    const calls: { url: string; init: RequestInit }[] = [];
    const ok = n8nSender("https://n8n.test/webhook/x", secret, (async (url: string, init: RequestInit) => (calls.push({ url, init }), new Response("{}"))) as typeof fetch);
    await ok({ instance: "Botanika", phone: "5531999999999", text: "oi", notificationId: "n1", kind: "FIRST_SALE", brand: "Botanika" });
    expect(calls[0]!.init.headers).toMatchObject({ Authorization: `Bearer ${secret}` });
    expect(JSON.parse(String(calls[0]!.init.body))).toMatchObject({ instance: "Botanika", phone: "5531999999999", text: "oi" });
    const bad = n8nSender("https://n8n.test/webhook/x", secret, (async () => new Response("no", { status: 500 })) as typeof fetch);
    await expect(bad({ instance: "B", phone: "1", text: "t", notificationId: "n", kind: "k", brand: "b" })).rejects.toThrow(/recusou/);
  });
});

describe("mensagem de aprovação (D-D4SIGN)", () => {
  it("produto na aba Pedidos, sugestão da marca, cupom e login; nunca pede para assinar contrato", async () => {
    const { approvalMessage } = await import("@/domain");
    const msg = approvalMessage({ brand: "Botanika", coupon: "MAYLEONEL", discountBps: 500, suggestion: "Hair Botanika", ordersUrl: "https://x.test/entrar?next=/portal/botanika/envios", loginUrl: "https://x.test/entrar?marca=botanika" });
    expect(msg).toContain("Prontinho, sua parceria foi aprovada!");
    expect(msg).not.toMatch(/teste|\u20e3|🩷/i); // pedido do responsável: sem "Creator Teste" e sem emoji que quebra
    expect(msg).toContain("escolher 1 produto da Botanika");
    expect(msg).toContain("aba Pedidos");
    expect(msg).toContain("🔗 https://x.test/entrar?next=/portal/botanika/envios");
    expect(msg).toContain("💡 Nossa sugestão: Hair Botanika ✨");
    expect(msg).toContain("*2. Seu cupom exclusivo:* MAYLEONEL");
    expect(msg).toContain("ganham 5% de desconto");
    expect(msg).toContain("e-mail e a senha cadastrados.\n\n🔗 https://x.test/entrar?marca=botanika");
    expect(msg).not.toMatch(/assin|contrato|suplemento/i);
  });

  it("sem sugestão, a linha some; sem senha, vai o convite", async () => {
    const { approvalMessage } = await import("@/domain");
    const msg = approvalMessage({ brand: "Revita Derma", coupon: "ANA", discountBps: 1250, suggestion: "  ", inviteLink: "https://x.test/convite/abc" });
    expect(msg).not.toContain("sugestão");
    expect(msg).toContain("12,5% de desconto");
    expect(msg).toContain("Crie sua senha por este link");
    expect(msg).toContain("https://x.test/convite/abc");
  });
});
