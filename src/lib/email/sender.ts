import type { EmailContent } from "@/domain";

/**
 * Envio de e-mail pelo Resend (D-EMAIL, D-SMTP). Sem `RESEND_API_KEY` e `EMAIL_DOMAIN` configurados não há remetente:
 * o sistema segue como antes (link na tela para mandar pelo WhatsApp). Só no servidor.
 * D-EMAILFROM: cada marca manda da própria caixa ("Botanika Creator Club <botanika@creatorclub.app.br>"); e-mail sem
 * marca (ou de marca sem caixa) sai como "Creator Club <botanika@...>".
 */

export class EmailError extends Error {}

export type EmailBrand = { slug: string; name: string };
export type EmailAttachment = { filename: string; content: Uint8Array };
export type EmailMessage = EmailContent & { to: string; idempotencyKey?: string; brand?: EmailBrand | null; attachments?: EmailAttachment[] };
export type EmailSender = (message: EmailMessage) => Promise<{ id: string }>;

/** Caixa de cada marca (slug → nome antes do @). */
const MAILBOX: Record<string, string> = { botanika: "botanika", vermefree: "vermefree", "revita-derma": "revita" };
const DEFAULT_MAILBOX = "botanika";

/** Remetente do e-mail: a caixa da marca, ou a padrão. */
export function fromAddress(domain: string, brand: EmailBrand | null | undefined): string {
  const box = brand ? MAILBOX[brand.slug] : undefined;
  const name = (box ? `${brand!.name} Creator Club` : "Creator Club").replace(/["<>]/g, "");
  return `${name} <${box ?? DEFAULT_MAILBOX}@${domain}>`;
}

export function resendSender(apiKey: string, domain: string, fetchImpl: typeof fetch = fetch): EmailSender {
  return async (m) => {
    const from = fromAddress(domain, m.brand);
    let res: Response;
    try {
      res = await fetchImpl("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          ...(m.idempotencyKey ? { "Idempotency-Key": m.idempotencyKey } : {}),
        },
        body: JSON.stringify({
          from,
          to: [m.to],
          subject: m.subject,
          html: m.html,
          text: m.text,
          ...(m.attachments?.length ? { attachments: m.attachments.map((a) => ({ filename: a.filename, content: Buffer.from(a.content).toString("base64") })) } : {}),
        }),
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
  const domain = env.EMAIL_DOMAIN?.trim().replace(/^@/, "");
  return key && domain ? resendSender(key, domain) : null;
}
