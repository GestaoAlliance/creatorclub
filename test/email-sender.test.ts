import { describe, expect, it } from "vitest";
import { configuredSender, EmailError, resendSender } from "@/lib/email/sender";

const msg = { to: "maria@example.com", subject: "Assunto", html: "<p>oi</p>", text: "oi", idempotencyKey: "invite-1" };

/** fetch falso: nada sai para a internet. */
function fakeFetch(status: number, body: unknown, calls: { url: string; init: RequestInit }[] = []) {
  return Object.assign(calls, {
    fn: (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify(body), { status });
    }) as unknown as typeof fetch,
  });
}

describe("remetente Resend (D-EMAIL)", () => {
  it("envia com a chave, o remetente, a chave de idempotência e o corpo certo", async () => {
    const f = fakeFetch(200, { id: "email-123" });
    expect(await resendSender("re_test", "Creator Club <nao-responda@exemplo.com>", f.fn)(msg)).toEqual({ id: "email-123" });
    expect(f[0]!.url).toBe("https://api.resend.com/emails");
    const headers = f[0]!.init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer re_test");
    expect(headers["Idempotency-Key"]).toBe("invite-1");
    expect(JSON.parse(String(f[0]!.init.body))).toEqual({ from: "Creator Club <nao-responda@exemplo.com>", to: ["maria@example.com"], subject: "Assunto", html: "<p>oi</p>", text: "oi" });
  });

  it("recusa do provedor e falha de rede viram EmailError com o motivo", async () => {
    await expect(resendSender("k", "f", fakeFetch(422, { message: "domain not verified" }).fn)(msg)).rejects.toThrow(/recusou \(422\): domain not verified/);
    await expect(resendSender("k", "f", (async () => { throw new TypeError("offline"); }) as unknown as typeof fetch)(msg)).rejects.toBeInstanceOf(EmailError);
  });

  it("sem chave ou sem remetente no ambiente, não há envio", () => {
    expect(configuredSender({})).toBeNull();
    expect(configuredSender({ RESEND_API_KEY: "re_x" })).toBeNull();
    expect(configuredSender({ RESEND_API_KEY: " ", EMAIL_FROM: "a@b.c" })).toBeNull();
    expect(configuredSender({ RESEND_API_KEY: "re_x", EMAIL_FROM: "a@b.c" })).toBeTypeOf("function");
  });
});
