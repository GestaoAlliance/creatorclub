/**
 * Links das redes e do WhatsApp nas telas da equipe (pedido do responsável): Instagram e telefone viram atalhos
 * clicáveis, e links colados nas respostas do formulário (TikTok, YouTube...) também.
 */

/** Perfil do Instagram a partir do que a pessoa escreveu ("@ana", "ana", "instagram.com/ana/"). Inválido: null. */
export function instagramUrl(raw: string | null | undefined): string | null {
  let h = (raw ?? "").trim();
  const fromUrl = h.match(/instagram\.com\/([^/?#\s]+)/i);
  if (fromUrl) h = fromUrl[1]!;
  h = h.replace(/^@+/, "").trim();
  return /^[A-Za-z0-9._]{1,30}$/.test(h) ? `https://instagram.com/${h}` : null;
}

/** Conversa no WhatsApp, sem texto pronto. Número brasileiro sem DDI ganha 55. Sem número utilizável: null. */
export function whatsappChatUrl(phone: string | null | undefined): string | null {
  let d = (phone ?? "").replace(/\D/g, "").replace(/^0+/, "");
  if (d.length === 10 || d.length === 11) d = `55${d}`;
  return /^55\d{10,11}$/.test(d) ? `https://wa.me/${d}` : null;
}

export type TextPart = { text: string; href?: string };

/** Separa o texto em pedaços, marcando os links http(s) e www. para virarem clicáveis. */
export function linkifyText(text: string): TextPart[] {
  const parts: TextPart[] = [];
  const re = /\b(?:https?:\/\/|www\.)[^\s<>"]+/gi;
  let last = 0;
  for (const m of text.matchAll(re)) {
    const url = m[0].replace(/[.,;:!?)\]]+$/, "");
    const at = m.index!;
    if (at > last) parts.push({ text: text.slice(last, at) });
    parts.push({ text: url, href: url.startsWith("www.") ? `https://${url}` : url });
    last = at + url.length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts;
}
