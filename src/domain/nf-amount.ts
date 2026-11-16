/**
 * D-NFAMOUNT: valor da nota do mês (= disponível para saque) com a conta aberta para a creator: comissão liberada mês a
 * mês, prêmios, ajustes, o que já foi pago antes do Creator Club, saques pagos, compras com o saldo e o saque em
 * andamento. A comissão ainda não liberada fica à parte ("entra na próxima nota"). A soma das linhas é sempre o
 * disponível: se algo não se encaixar, vira a linha "Outros ajustes".
 */

/** D-PAYFLOW: o que sobra quando a conta da nota não fecha com o valor pedido (para a equipe conferir). */
export const UNEXPLAINED = "diferença sem explicação: confira o extrato";

export type NfEntry = { type: string; amountCents: number; month: string; held: boolean };
export type NfLine = { key: string; label: string; cents: number; month?: string };

const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
export const monthNamePt = (m: string) => MONTHS[Number(m.slice(5)) - 1]!;

export function nfBreakdown(entries: readonly NfEntry[], releasedThrough: string | null, reservedCents: number, availableCents: number) {
  const isOrder = (t: string) => t === "COMMISSION" || t === "REVERSAL";
  const released = new Map<string, number>();
  const later = new Map<string, number>();
  const other = new Map<string, number>();
  let heldOther = 0;
  for (const e of entries) {
    if (isOrder(e.type)) {
      const free = releasedThrough !== null && e.month <= releasedThrough;
      const m = free ? released : later;
      m.set(e.month, (m.get(e.month) ?? 0) + e.amountCents);
    } else if (e.held) {
      heldOther += e.amountCents;
    } else {
      other.set(e.type, (other.get(e.type) ?? 0) + e.amountCents);
    }
  }
  const lines: NfLine[] = [...released]
    .sort(([a], [b]) => a.localeCompare(b))
    .filter(([, c]) => c !== 0)
    .map(([m, c]) => ({ key: `c:${m}`, label: `Comissão de ${monthNamePt(m)}`, cents: c, month: m }));
  // Mês ainda não liberado com estorno maior que a comissão: o negativo já desconta agora (D-NEG).
  for (const [m, c] of [...later].sort(([a], [b]) => a.localeCompare(b))) if (c < 0) lines.push({ key: `e:${m}`, label: `Estornos de ${monthNamePt(m)}`, cents: c, month: m });
  const LABEL: Record<string, string> = {
    PRIZE: "Prêmios de campanha",
    ADJUSTMENT: "Ajustes da equipe",
    OPENING_BALANCE: "Já pago antes do Creator Club",
    WITHDRAWAL: "Saques já pagos",
    PURCHASE: "Compras com o saldo",
  };
  for (const t of ["PRIZE", "ADJUSTMENT", "OPENING_BALANCE", "WITHDRAWAL", "PURCHASE"]) {
    const c = other.get(t) ?? 0;
    if (c !== 0) lines.push({ key: t, label: LABEL[t]!, cents: c });
  }
  if (reservedCents > 0) lines.push({ key: "RESERVED", label: "Saque em andamento", cents: -reservedCents });
  const sum = lines.reduce((s, l) => s + l.cents, 0);
  if (sum !== availableCents) lines.push({ key: "OTHER", label: "Outros ajustes", cents: availableCents - sum });
  const next = [...later].sort(([a], [b]) => a.localeCompare(b)).filter(([, c]) => c > 0).map(([m, c]) => ({ month: m, cents: c }));
  return { lines, totalCents: availableCents, next, heldOtherCents: Math.max(0, heldOther) };
}
