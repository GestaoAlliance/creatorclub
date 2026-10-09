import { assertBps, type Bps } from "./money";

/**
 * Taxa de comissão de uma creator com vigência. Intervalo [validFrom, validTo):
 * validTo nulo = vigente até nova mudança. Períodos não podem se sobrepor.
 */
export type CommissionPolicy = {
  id: string;
  creatorId: string;
  rateBps: Bps;
  validFrom: Date;
  validTo: Date | null;
  /** Taxa confirmada pela Ana (D-RATEIMPORT). Taxa "a confirmar" nunca entra em cálculo. */
  confirmed: boolean;
};

export class PolicyError extends Error {
  override name = "PolicyError";
}

export function assertNoOverlap(policies: readonly CommissionPolicy[]): void {
  const byCreator = new Map<string, CommissionPolicy[]>();
  for (const p of policies) {
    assertBps(p.rateBps);
    if (p.validTo && p.validTo <= p.validFrom) {
      throw new PolicyError(`política ${p.id} termina antes de começar`);
    }
    const list = byCreator.get(p.creatorId) ?? [];
    list.push(p);
    byCreator.set(p.creatorId, list);
  }
  for (const list of byCreator.values()) {
    const sorted = [...list].sort((a, b) => a.validFrom.getTime() - b.validFrom.getTime());
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1]!;
      const curr = sorted[i]!;
      if (prev.validTo === null || prev.validTo > curr.validFrom) {
        throw new PolicyError(`políticas ${prev.id} e ${curr.id} se sobrepõem`);
      }
    }
  }
}

/**
 * Taxa vigente no instante `at` (proposta: instante do pagamento do pedido).
 * Sem política cobrindo o instante → erro: nunca cair na taxa atual por omissão.
 */
export function rateAt(policies: readonly CommissionPolicy[], creatorId: string, at: Date): Bps {
  const match = policies.find(
    (p) => p.creatorId === creatorId && p.validFrom <= at && (p.validTo === null || at < p.validTo),
  );
  if (!match) {
    throw new PolicyError(`sem taxa de comissão vigente para ${creatorId} em ${at.toISOString()}`);
  }
  if (!match.confirmed) {
    throw new PolicyError(`taxa de ${creatorId} em ${at.toISOString()} ainda a confirmar`);
  }
  return match.rateBps;
}
