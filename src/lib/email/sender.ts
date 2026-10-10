import type { EmailContent } from "@/domain";

/**
 * Envio de e-mail pelo Resend (D-EMAIL, D-SMTP). Sem `RESEND_API_KEY` e `EMAIL_FROM` configurados não há remetente:
 * o sistema segue como antes (link na tela para mandar pelo WhatsApp). Só no servidor.
 */

export class EmailError extends Error {}

export type EmailMessage = EmailContent & { to: string; idempotencyKey?: string };
export type EmailSender = (message: EmailMessage) => Promise<{ id: string }>;

export function resendSender(apiKey: string, from: string, fetchImpl: typeof fetch = fetch): EmailSender {
  return async (m) => {
    let res: Response;
    try {
      res = await fetchImpl("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          ...(m.idempotencyKey ? { "Idempotency-Key": m.idempotencyKey } : {}),
        },
        body: JSON.stringify({ from, to: [m.to], subject: m.subject, html: m.html, text: m.text }),
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw new EmailError("Falha de rede ao enviar o e-mail.");
    }
    const body = (await res.json().catch(() => null)) as { id?: string; message?: string } | null;
    if (!res.ok || !body?.id) throw new EmailError(`O provedor de e-mail recusou (${res.status})${body?.message ? `: ${body.message}` : ""}.`);
    return { id: body.id };
  };
}

/** Remetente configurado no ambiente, ou null (sem e-mail: segue só com o link na tela). */
export function configuredSender(env: Record<string, string | undefined> = process.env): EmailSender | null {
  const key = env.RESEND_API_KEY?.trim();
  const from = env.EMAIL_FROM?.trim();
  return key && from ? resendSender(key, from) : null;
}
