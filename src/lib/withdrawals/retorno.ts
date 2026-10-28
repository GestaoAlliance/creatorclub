import type { PrismaClient } from "@/generated/prisma/client";
import { notices, parseRetorno, remessaRef, RETORNO_CODES, type RetornoResult } from "@/domain";
import type { Actor } from "@/lib/auth/actor";
import { can } from "@/lib/auth/permissions";
import { notify } from "@/lib/notifications/notify";
import { payWithdrawal, WithdrawalDecisionError } from "./decide";
import { RemessaError } from "./remessa";

/**
 * Retorno SICOOB (D-RETORNO): o Pagamento sobe o arquivo de retorno do Internet Banking, vê a prévia e confirma.
 * "00" marca o saque como pago (o mesmo passo do botão "pago"); "BD" fica como agendado; "PD" como pendente de
 * assinatura; recusa tira o saque da remessa (vai na próxima), guarda o motivo e avisa a creator. Subir o mesmo
 * arquivo de novo não repete nada: cada passo só vale a partir do estado certo.
 */

const MAX_SIZE = 1_000_000;

export type RetornoRow = {
  ref: string;
  name: string;
  amountCents: number;
  result: RetornoResult;
  reason: string;
  withdrawalId: string | null;
  /** ok = será aplicado; done = já está assim; notfound = não é saque desta remessa; amount = valor diferente do saque. */
  state: "ok" | "done" | "notfound" | "amount";
};

export const reasonOf = (codes: readonly string[]) => (codes.length ? codes.map((c) => RETORNO_CODES[c] ?? `Código ${c} do banco`).join("; ") : "Sem código do banco");

function assertPay(actor: Actor | null, brandId: string): asserts actor is Actor {
  if (!actor || !can(actor.grants, "withdrawals.manage", brandId)) throw new RemessaError("Sem permissão.");
}

/** Lê o retorno e diz o que vai acontecer com cada saque; não muda nada. */
export async function retornoPreview(prisma: PrismaClient, actor: Actor | null, brandId: string, content: string) {
  assertPay(actor, brandId);
  if (content.length > MAX_SIZE) throw new RemessaError("Arquivo grande demais para um retorno.");
  const parsed = parseRetorno(content);
  if (parsed.problems.length) throw new RemessaError("Não deu para ler o arquivo de retorno.", parsed.problems.map((problem) => ({ id: null, problem })));
  const remittance = parsed.nsa === null ? null : await prisma.paymentRemittance.findUnique({ where: { brandId_nsa: { brandId, nsa: parsed.nsa } }, select: { id: true, nsa: true } });
  if (!remittance) throw new RemessaError(`Este retorno é da remessa nº ${parsed.nsa ?? "?"}, que não foi gerada para esta marca.`);
  const sent = await prisma.withdrawal.findMany({
    where: { brandId, OR: [{ remittanceId: remittance.id }, { bankResult: "REJECTED", remittanceId: null }] },
    select: { id: true, amountCents: true, status: true, remittanceId: true, bankResult: true },
  });
  const byRef = new Map(sent.map((w) => [remessaRef(w.id), w]));
  const rows: RetornoRow[] = parsed.items.map((i) => {
    const w = byRef.get(i.ref);
    const base = { ref: i.ref, name: i.name, amountCents: i.amountCents, result: i.result, reason: reasonOf(i.codes), withdrawalId: w?.id ?? null };
    if (!w) return { ...base, state: "notfound" };
    if (w.amountCents !== i.amountCents) return { ...base, state: "amount" };
    const inThis = w.status === "APPROVED" && w.remittanceId === remittance.id;
    const done =
      i.result === "PAID" ? w.status === "PAID" : i.result === "REJECTED" ? !inThis : inThis && w.bankResult === i.result;
    if (done) return { ...base, state: "done" };
    return { ...base, state: inThis ? "ok" : "done" };
  });
  return { nsa: remittance.nsa, remittanceId: remittance.id, rows };
}

/** Aplica o retorno (depois da prévia): cada saque vale sozinho; devolve quantos de cada. */
export async function applyRetorno(prisma: PrismaClient, actor: Actor | null, brandId: string, content: string, now = new Date()) {
  const preview = await retornoPreview(prisma, actor, brandId, content);
  assertPay(actor, brandId);
  const counts = { paid: 0, scheduled: 0, pending: 0, rejected: 0, skipped: 0 };
  for (const row of preview.rows) {
    if (row.state !== "ok" || !row.withdrawalId) {
      counts.skipped++;
      continue;
    }
    const id = row.withdrawalId;
    if (row.result === "PAID") {
      try {
        await payWithdrawal(prisma, actor, id, now);
        counts.paid++;
      } catch (error) {
        if (!(error instanceof WithdrawalDecisionError)) throw error;
        counts.skipped++;
      }
      continue;
    }
    const where = { id, brandId, status: "APPROVED" as const, remittanceId: preview.remittanceId };
    if (row.result === "REJECTED") {
      const ok = await prisma.$transaction(async (tx) => {
        const w = await tx.withdrawal.findFirst({ where, select: { creatorId: true, amountCents: true } });
        if (!w) return false;
        await tx.withdrawal.update({ where: { id }, data: { remittanceId: null, bankResult: "REJECTED", bankNote: row.reason, bankAt: now } });
        await tx.auditLog.create({
          data: { brandId, actorType: "USER", actorId: actor.userId, action: "withdrawal.bank_rejected", entity: "Withdrawal", entityId: id, before: { remittanceId: preview.remittanceId }, after: { nsa: preview.nsa, reason: row.reason } },
        });
        await notify(tx, [{ brandId, creatorId: w.creatorId, notice: notices.withdrawalBankRejected(id, preview.nsa, w.amountCents, row.reason) }]);
        return true;
      });
      if (ok) counts.rejected++;
      else counts.skipped++;
      continue;
    }
    const { count } = await prisma.withdrawal.updateMany({ where, data: { bankResult: row.result, bankNote: row.reason, bankAt: now } });
    if (count === 0) counts.skipped++;
    else if (row.result === "SCHEDULED") counts.scheduled++;
    else counts.pending++;
  }
  await prisma.auditLog.create({
    data: { brandId, actorType: "USER", actorId: actor.userId, action: "remittance.return", entity: "PaymentRemittance", entityId: preview.remittanceId, after: { nsa: preview.nsa, ...counts } },
  });
  return { nsa: preview.nsa, ...counts };
}
