import type { CheckRow } from "./check";
import type { PayRow } from "./month-board";

/**
 * D-PAYQUEUE: Pagamentos numa fila só, cada creator na etapa em que está, com um botão (a próxima ação):
 * conferir (vendas × % = valor no Creator Club) → esperando o pedido → aprovar a nota/recibo → pagar → pago.
 * Pedido em análise de quem ainda não foi conferida fica em "conferir" (a aprovação é travada até conferir, D-PAYCHECK).
 */
export type QueueStage = "conferir" | "pedir" | "aprovar" | "pagar" | "pago";
export const QUEUE_STAGES: readonly QueueStage[] = ["conferir", "pedir", "aprovar", "pagar", "pago"];

export type QueueItem = {
  key: string;
  stage: QueueStage;
  creatorId: string;
  name: string;
  /** O valor da etapa: o do saque pedido, ou o disponível para a nota. */
  cents: number;
  check: CheckRow | null;
  pay: PayRow | null;
};

export const checkDone = (c: CheckRow) => c.check?.status === "CHECKED" && !c.check.stale;

export function buildQueue(input: { check: readonly CheckRow[]; aprovar: readonly PayRow[]; pagar: readonly PayRow[]; pagos: readonly PayRow[] }): QueueItem[] {
  const out: QueueItem[] = [];
  const waitingCheck = new Set<string>();
  const byWithdrawal = new Map(input.aprovar.filter((r) => r.withdrawalId).map((r) => [r.withdrawalId!, r]));
  for (const c of input.check) {
    // Aprovado já passou da conferência: vai em "pagar".
    if (c.withdrawal?.status === "APPROVED") continue;
    if (!checkDone(c)) {
      waitingCheck.add(c.creatorId);
      out.push({ key: `c:${c.creatorId}`, stage: "conferir", creatorId: c.creatorId, name: c.name, cents: c.systemCents, check: c, pay: c.withdrawal ? (byWithdrawal.get(c.withdrawal.id) ?? null) : null });
    } else if (!c.withdrawal) {
      out.push({ key: `c:${c.creatorId}`, stage: "pedir", creatorId: c.creatorId, name: c.name, cents: c.systemCents, check: c, pay: null });
    }
  }
  const checkOf = new Map(input.check.map((c) => [c.creatorId, c]));
  for (const r of input.aprovar) {
    if (waitingCheck.has(r.creatorId)) continue;
    out.push({ key: r.key, stage: "aprovar", creatorId: r.creatorId, name: r.name, cents: r.nfCents, check: checkOf.get(r.creatorId) ?? null, pay: r });
  }
  for (const r of input.pagar) out.push({ key: r.key, stage: "pagar", creatorId: r.creatorId, name: r.name, cents: r.nfCents, check: null, pay: r });
  for (const r of input.pagos) out.push({ key: r.key, stage: "pago", creatorId: r.creatorId, name: r.name, cents: r.nfCents, check: null, pay: r });
  const order = (s: QueueStage) => QUEUE_STAGES.indexOf(s);
  return out.sort((a, b) => order(a.stage) - order(b.stage) || a.name.localeCompare(b.name, "pt-BR"));
}

/** Quantas e quanto em cada etapa. */
export function queueCounts(items: readonly QueueItem[]): Record<QueueStage, { count: number; cents: number }> {
  const out = Object.fromEntries(QUEUE_STAGES.map((s) => [s, { count: 0, cents: 0 }])) as Record<QueueStage, { count: number; cents: number }>;
  for (const i of items) {
    out[i.stage].count++;
    out[i.stage].cents += i.cents;
  }
  return out;
}
