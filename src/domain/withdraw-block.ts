/**
 * D-CANTWITHDRAW: por que uma creator com saldo liberado não consegue pedir o saque. Pix e CNPJ não travam (ela informa
 * o Pix no pedido e o CNPJ vem da nota); travam o acesso, o contrato e o termo no portal e o saldo em conferência.
 */
export type WithdrawBlockReason = "NO_LOGIN" | "AWAITING_CONTRACT" | "CONTRACT" | "TERMS" | "LOCKED";

export const WITHDRAW_BLOCK_LABEL: Record<WithdrawBlockReason, string> = {
  NO_LOGIN: "sem acesso ao portal",
  AWAITING_CONTRACT: "contrato do Autentique sem assinar",
  CONTRACT: "contrato para assinar no portal",
  TERMS: "termo do Creator Club para aceitar no portal",
  LOCKED: "saldo em conferência (Abertura)",
};

export function withdrawBlockReasons(c: { hasLogin: boolean; awaitingContract: boolean; contractPending: boolean; termsPending: boolean; unlocked: boolean }): WithdrawBlockReason[] {
  const out: WithdrawBlockReason[] = [];
  if (!c.hasLogin) out.push("NO_LOGIN");
  if (c.awaitingContract) out.push("AWAITING_CONTRACT");
  else if (c.contractPending) out.push("CONTRACT");
  // O termo só aparece depois do contrato; com o contrato pendente ele ainda nem é pedido.
  else if (c.termsPending) out.push("TERMS");
  if (!c.unlocked) out.push("LOCKED");
  return out;
}

/** O que a creator mesma precisa fazer (a conferência é da equipe). Vazio: nada a pedir para ela. */
export function withdrawBlockAsk(reasons: readonly WithdrawBlockReason[]): string[] {
  return reasons.flatMap((r) =>
    r === "NO_LOGIN" ? ["entrar no portal (me avisa que eu te mando o link de acesso)"]
    : r === "AWAITING_CONTRACT" || r === "CONTRACT" ? ["assinar o contrato"]
    : r === "TERMS" ? [reasons.includes("NO_LOGIN") ? "aceitar o termo do Creator Club (aparece logo na entrada)" : "entrar no portal e aceitar o termo do Creator Club (aparece logo na entrada)"]
    : [],
  );
}
