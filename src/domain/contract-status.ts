/** Selo do contrato da candidata no Autentique (D-AUTENTIQUE2): na lista de Candidatas e no quadro do contrato. */
export type ContractBadgeTone = "neutral" | "amber" | "green" | "red";

export function contractBadge(c: { status: string } | null, error: string | null): { label: string; tone: ContractBadgeTone } {
  if (!c) return { label: error ? "contrato não enviado (ver motivo)" : "contrato não enviado", tone: error ? "red" : "neutral" };
  if (c.status === "SIGNED") return { label: "contrato assinado", tone: "green" };
  if (c.status === "SENT") return { label: "contrato não assinado", tone: "amber" };
  if (c.status === "REJECTED") return { label: "ela recusou o contrato", tone: "red" };
  return { label: "contrato cancelado", tone: "neutral" };
}
