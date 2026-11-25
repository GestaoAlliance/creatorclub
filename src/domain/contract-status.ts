/** Selo do contrato da candidata no Autentique (D-AUTENTIQUE2): na lista de Candidatas e no quadro do contrato. */
export type ContractBadgeTone = "neutral" | "amber" | "green" | "red";

export function contractBadge(c: { status: string } | null, error: string | null): { label: string; tone: ContractBadgeTone } {
  if (!c) return { label: error ? "contrato não enviado (ver motivo)" : "contrato não enviado", tone: error ? "red" : "neutral" };
  if (c.status === "SIGNED") return { label: "contrato assinado", tone: "green" };
  if (c.status === "SENT") return { label: "contrato não assinado", tone: "amber" };
  if (c.status === "REJECTED") return { label: "ela recusou o contrato", tone: "red" };
  return { label: "contrato cancelado", tone: "neutral" };
}

/**
 * Por onde foi (ou vai) o link de assinatura (D-LINKCHANNEL): sem WhatsApp ligado na marca, o link só vai no e-mail do
 * Autentique; não mostrar "na fila do WhatsApp" para algo que nunca vai sair.
 */
export function contractLinkNote(c: { status: string; signLink: string | null; linkSentAt: Date | null }, whatsapp: boolean, when: (d: Date) => string): string {
  if (c.linkSentAt) return ` · link no WhatsApp em ${when(c.linkSentAt)}`;
  if (c.status !== "SENT" || !c.signLink) return "";
  return whatsapp ? " · link no WhatsApp: na fila (9h às 20h)" : " · link só no e-mail (a marca não tem WhatsApp ligado)";
}
