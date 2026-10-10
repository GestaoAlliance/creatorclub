/**
 * Textos dos e-mails do sistema (D-EMAIL). Só monta assunto, HTML e texto puro; quem envia é `src/lib/email`.
 * Tudo que vem do banco passa por `escapeHtml` antes de entrar no HTML.
 */

export type EmailContent = { subject: string; html: string; text: string };

export function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

const firstName = (name: string) => name.trim().split(/\s+/)[0] || name.trim();
const dayMonth = (d: Date) => d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" });

/** Moldura simples (e-mail não aceita o visual do site): título, parágrafos, um botão e o rodapé. */
function layout(input: { title: string; paragraphs: string[]; button: { label: string; href: string }; footer: string[] }): string {
  const p = (t: string) => `<p style="margin:0 0 16px;font-size:15px;line-height:1.5;color:#292524">${t}</p>`;
  const small = (t: string) => `<p style="margin:0 0 8px;font-size:12px;line-height:1.5;color:#78716c">${t}</p>`;
  return `<!doctype html><html lang="pt-BR"><body style="margin:0;padding:24px;background:#f5f5f4;font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;background:#ffffff;border-radius:16px;padding:32px">
<tr><td>
<h1 style="margin:0 0 20px;font-size:20px;color:#1c1917">${input.title}</h1>
${input.paragraphs.map(p).join("\n")}
<p style="margin:24px 0"><a href="${escapeHtml(input.button.href)}" style="display:inline-block;background:#1c1917;color:#ffffff;text-decoration:none;font-weight:bold;font-size:15px;padding:12px 22px;border-radius:999px">${input.button.label}</a></p>
${small(`Se o botão não abrir, copie este endereço no navegador:<br><span style="word-break:break-all">${escapeHtml(input.button.href)}</span>`)}
${input.footer.map(small).join("\n")}
</td></tr></table>
</td></tr></table>
</body></html>`;
}

/** Convite da creator para o portal (D-EMAIL). */
export function creatorInviteEmail(input: { name: string; brandName: string; link: string; expiresAt: Date }): EmailContent {
  const brand = escapeHtml(input.brandName);
  const name = escapeHtml(firstName(input.name));
  const until = dayMonth(input.expiresAt);
  return {
    subject: `Seu acesso ao Creator Club ${input.brandName}`,
    html: layout({
      title: `Oi, ${name}!`,
      paragraphs: [
        `Você foi convidada para o portal do <strong>Creator Club ${brand}</strong>. Lá você acompanha suas vendas, seu cupom e seu link.`,
        "Para entrar, crie sua senha pelo botão abaixo.",
      ],
      button: { label: "Criar meu acesso", href: input.link },
      footer: [
        `O link vale até ${until} e só funciona uma vez, com este e-mail.`,
        "Se você não esperava este convite, pode ignorar esta mensagem.",
      ],
    }),
    text: [
      `Oi, ${firstName(input.name)}!`,
      "",
      `Você foi convidada para o portal do Creator Club ${input.brandName}. Lá você acompanha suas vendas, seu cupom e seu link.`,
      "Para entrar, crie sua senha neste link:",
      input.link,
      "",
      `O link vale até ${until} e só funciona uma vez, com este e-mail.`,
      "Se você não esperava este convite, pode ignorar esta mensagem.",
    ].join("\n"),
  };
}

/** Convite de alguém da equipe (D-EMAIL). `brandName` nulo = todas as marcas (super admin). */
export function staffInviteEmail(input: { name: string; roleLabel: string; brandName: string | null; link: string; expiresAt: Date }): EmailContent {
  const where = input.brandName ? ` da ${input.brandName}` : "";
  const until = dayMonth(input.expiresAt);
  return {
    subject: "Convite para a equipe do Creator Club",
    html: layout({
      title: `Oi, ${escapeHtml(firstName(input.name))}!`,
      paragraphs: [
        `Você recebeu um convite para a equipe do <strong>Creator Club</strong> como <strong>${escapeHtml(input.roleLabel)}</strong>${escapeHtml(where)}.`,
        "Para entrar, crie sua senha pelo botão abaixo.",
      ],
      button: { label: "Aceitar o convite", href: input.link },
      footer: [`O link vale até ${until} e só funciona uma vez, com este e-mail.`, "Se você não esperava este convite, pode ignorar esta mensagem."],
    }),
    text: [
      `Oi, ${firstName(input.name)}!`,
      "",
      `Você recebeu um convite para a equipe do Creator Club como ${input.roleLabel}${where}.`,
      "Para entrar, crie sua senha neste link:",
      input.link,
      "",
      `O link vale até ${until} e só funciona uma vez, com este e-mail.`,
      "Se você não esperava este convite, pode ignorar esta mensagem.",
    ].join("\n"),
  };
}
