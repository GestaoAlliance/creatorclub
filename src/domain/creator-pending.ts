/** Pendências de uma creator na lista Creators (D-CREATORPENDING), na ordem em que a equipe resolve. Desligada não tem. */
export type CreatorPendingInput = {
  status: string;
  reviewed: boolean;
  ownerPending: boolean;
  ratePending: boolean;
  fakeEmail: boolean;
  contract: "NONE" | "ACTIVE" | "EXPIRING" | "EXPIRED";
};

export function creatorPendings(c: CreatorPendingInput): string[] {
  if (c.status === "DEACTIVATED") return [];
  const out: string[] = [];
  if (c.ownerPending) out.push("dona do cupom a confirmar");
  if (c.ratePending) out.push("taxa a confirmar");
  if (!c.reviewed) out.push("números a conferir");
  if (c.fakeEmail) out.push("e-mail a confirmar");
  if (c.contract === "EXPIRED") out.push("contrato vencido");
  else if (c.contract === "EXPIRING") out.push("contrato vencendo");
  return out;
}
