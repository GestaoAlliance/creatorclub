import { usableHandle } from "./social";

/**
 * Prospecção antes do formulário (U6, D-PROSPECT): perfis abordados pela Gestão e pelas hunters, no lugar da aba
 * "Prospecção Hunter" da Central. Regras puras (testadas em test/prospect.test.ts).
 */

export type ProspectStatusKey = "FIRST_MESSAGE" | "FOLLOW_UP" | "FORM_SENT" | "SIGNED_UP" | "DECLINED";

export const PROSPECT_STATUS_LABEL: Record<ProspectStatusKey, string> = {
  FIRST_MESSAGE: "1ª mensagem",
  FOLLOW_UP: "Follow up",
  FORM_SENT: "Forms enviado",
  SIGNED_UP: "Inscrita",
  DECLINED: "Recusou",
};

export const PROSPECT_STATUSES = Object.keys(PROSPECT_STATUS_LABEL) as ProspectStatusKey[];

/** Dias sem mudar a situação até pedir o follow up (pedido do responsável: 3 dias). */
export const FOLLOW_UP_DAYS = 3;
export const MAX_HANDLES_PER_ADD = 60;

/** @ guardado: sem "@", minúsculas (o Instagram não diferencia). Inválido: null. */
export function prospectHandle(raw: string | null | undefined): string | null {
  const h = usableHandle(raw);
  return h ? h.toLowerCase() : null;
}

/** Vários @ colados (um por linha, ou separados por vírgula/espaço), sem repetir. Os inválidos voltam à parte. */
export function parseHandles(text: string): { handles: string[]; invalid: string[] } {
  const handles: string[] = [];
  const invalid: string[] = [];
  for (const piece of text.split(/[\n,;\s]+/)) {
    const raw = piece.trim();
    if (!raw) continue;
    const h = prospectHandle(raw);
    if (!h) invalid.push(raw);
    else if (!handles.includes(h)) handles.push(h);
  }
  return { handles, invalid };
}

/** Pede follow up: em "1ª mensagem" ou "Forms enviado" há 3 dias ou mais sem mudar. */
export function needsFollowUp(p: { status: ProspectStatusKey; statusAt: Date }, now: Date): boolean {
  return (p.status === "FIRST_MESSAGE" || p.status === "FORM_SENT") && now.getTime() - p.statusAt.getTime() >= FOLLOW_UP_DAYS * 86_400_000;
}

/** Situação da aba da planilha → situação no sistema ("Forms?" = Sim: ela respondeu o forms). */
export function sheetProspectStatus(status: string, formAnswered: string): ProspectStatusKey {
  if (/^sim/i.test(formAnswered.trim())) return "SIGNED_UP";
  const s = status.trim().toLowerCase();
  if (s.startsWith("prop")) return "DECLINED";
  if (s.startsWith("forms")) return "FORM_SENT";
  if (s.startsWith("follow")) return "FOLLOW_UP";
  return "FIRST_MESSAGE";
}

export type ProspectMessages = { first: string; proposal: string };

/** Textos da aba "Prospecção Hunter" da Botanika (2026-10), com o nome de quem manda e o link de inscrição dela. */
const BOTANIKA: ProspectMessages = {
  first:
    "Oi, (Nome)! Tudo bem?\nSou a {EU}, da {MARCA}.\n\nSeu perfil tem exatamente a energia e o cuidado que a marca busca transmitir. Estamos com vontade de começar uma parceria com você. 💜\n\nPosso te enviar como funciona?",
  proposal:
    "Somos uma marca de suplementos naturais premium. 💜\n\nVou te explicar como funciona:\n\n•  Você recebe 1 suplemento para dar início à parceria;\n•  Ao atingir R$ 1.000 em vendas nos primeiros 45 dias, você recebe mais um;\n•  Cupom EXCLUSIVO com {DESCONTO} de desconto para a sua audiência;\n•  {COMISSAO} de comissão nas vendas realizadas com seu cupom.\n\nSe fizer sentido para você, peço que responda o forms para darmos continuidade a parceria:\n{LINK}\n\nSerá um prazer ter você no nosso time. ✨",
};

/** Padrão das outras marcas: sem falar de produto (cada marca escreve o dela). */
const GENERIC: ProspectMessages = {
  first: BOTANIKA.first,
  proposal:
    "Vou te explicar como funciona a parceria com a {MARCA}:\n\n•  Cupom EXCLUSIVO com {DESCONTO} de desconto para a sua audiência;\n•  {COMISSAO} de comissão nas vendas realizadas com seu cupom.\n\nSe fizer sentido para você, peço que responda o forms para darmos continuidade a parceria:\n{LINK}\n\nSerá um prazer ter você no nosso time. ✨",
};

export function prospectMessages(brand: { slug: string; prospectFirstMessage: string | null; prospectProposalMessage: string | null }): ProspectMessages & { custom: boolean } {
  const base = brand.slug === "botanika" ? BOTANIKA : GENERIC;
  return { first: brand.prospectFirstMessage ?? base.first, proposal: brand.prospectProposalMessage ?? base.proposal, custom: brand.prospectFirstMessage !== null || brand.prospectProposalMessage !== null };
}

const pct = (bps: number) => `${(bps / 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;

/** Troca {EU}, {MARCA}, {LINK}, {DESCONTO} e {COMISSAO} pelos valores de quem vai mandar. */
export function fillProspectMessage(text: string, v: { me: string; brand: string; link: string; discountBps: number; commissionBps: number }): string {
  const first = v.me.trim().split(/\s+/)[0] ?? v.me;
  return text
    .replaceAll("{EU}", first)
    .replaceAll("{MARCA}", v.brand)
    .replaceAll("{LINK}", v.link)
    .replaceAll("{DESCONTO}", pct(v.discountBps))
    .replaceAll("{COMISSAO}", pct(v.commissionBps));
}
