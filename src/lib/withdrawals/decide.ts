import type { PrismaClient } from "@/generated/prisma/client";
import { checkNf, computeBalance, notices, parseNfseText } from "@/domain";
import { notify } from "@/lib/notifications/notify";
import type { Actor } from "@/lib/auth/actor";
import { brandsWith, can } from "@/lib/auth/permissions";
import { ledgerEntriesWithMonth, releasedThroughFor } from "@/lib/commission/release";
import type { PortalContext } from "@/lib/portal/context";
import { pdfText } from "./nf";

/**
 * Decisão do saque (E8, D-WDDECIDE; em duas etapas desde M1.1, D-WDAPPROVE):
 * - **em análise → aprovado**: a Gestão (Ana) ou o super admin aprova (`withdrawals.approve`), ou recusa com motivo;
 * - **aprovado → pago**: o Pagamento (Juci) faz o Pix e marca como pago (`withdrawals.manage`; no dia do clique): o
 *   valor sai do extrato num lançamento WITHDRAWAL, uma vez só (`LedgerEntry_one_payment_per_withdrawal`); ou recusa com
 *   motivo (ex.: Pix com erro) e o valor volta a ficar disponível.
 * Recusa sempre com motivo (`Withdrawal_rejected_has_note`), que a creator vê. A creator pode **cancelar** o próprio
 * pedido enquanto está em análise. Cada passo só vale a partir do estado certo (dois cliques não pagam duas vezes) e
 * vai para a auditoria.
 */

export class WithdrawalDecisionError extends Error {}

function assertManage(actor: Actor | null, brandId: string): asserts actor is Actor {
  if (!actor || !can(actor.grants, "withdrawals.manage", brandId)) throw new WithdrawalDecisionError("Sem permissão para pagar saques.");
}

function assertApprove(actor: Actor | null, brandId: string): asserts actor is Actor {
  if (!actor || !can(actor.grants, "withdrawals.approve", brandId)) throw new WithdrawalDecisionError("Sem permissão para aprovar saques.");
}

function assertView(actor: Actor | null, brandId: string): asserts actor is Actor {
  if (!actor || !can(actor.grants, "withdrawals.view", brandId)) throw new WithdrawalDecisionError("Sem permissão para saques.");
}

/** M1.1: a Gestão aprova o pedido em análise; ele vai para a fila do Pagamento. */
export async function approveWithdrawal(prisma: PrismaClient, actor: Actor | null, withdrawalId: string, now = new Date()) {
  const w = await load(prisma, withdrawalId);
  assertApprove(actor, w.brandId);
  await prisma.$transaction(async (tx) => {
    const { count } = await tx.withdrawal.updateMany({
      where: { id: w.id, status: "REQUESTED" },
      data: { status: "APPROVED", approvedAt: now, approvedById: actor.userId },
    });
    if (count === 0) throw new WithdrawalDecisionError(CHANGED);
    await tx.auditLog.create({
      data: { brandId: w.brandId, actorType: "USER", actorId: actor.userId, action: "withdrawal.approved", entity: "Withdrawal", entityId: w.id, after: { amountCents: w.amountCents } },
    });
    await notify(tx, [{ brandId: w.brandId, creatorId: w.creatorId, notice: notices.withdrawalApproved(w.id, w.amountCents) }]);
  });
}

async function load(prisma: PrismaClient, id: string) {
  const w = await prisma.withdrawal.findUnique({ where: { id }, select: { id: true, brandId: true, creatorId: true, amountCents: true, status: true } });
  if (!w) throw new WithdrawalDecisionError("Saque não encontrado.");
  return w;
}

const CHANGED = "Este saque mudou de situação. Atualize a página.";

export async function payWithdrawal(prisma: PrismaClient, actor: Actor | null, withdrawalId: string, now = new Date()) {
  const w = await load(prisma, withdrawalId);
  assertManage(actor, w.brandId);
  await prisma.$transaction(async (tx) => {
    const { count } = await tx.withdrawal.updateMany({
      where: { id: w.id, status: "APPROVED" },
      data: { status: "PAID", decidedAt: now, decidedById: actor.userId },
    });
    if (count === 0) throw new WithdrawalDecisionError(CHANGED);
    await tx.ledgerEntry.create({
      data: {
        brandId: w.brandId,
        creatorId: w.creatorId,
        type: "WITHDRAWAL",
        amountCents: -w.amountCents,
        withdrawalId: w.id,
        availableAt: now,
        idempotencyKey: `withdrawal:paid:${w.id}`,
        createdById: actor.userId,
      },
    });
    await tx.auditLog.create({
      data: { brandId: w.brandId, actorType: "USER", actorId: actor.userId, action: "withdrawal.paid", entity: "Withdrawal", entityId: w.id, after: { amountCents: w.amountCents } },
    });
    await notify(tx, [{ brandId: w.brandId, creatorId: w.creatorId, notice: notices.withdrawalPaid(w.id, w.amountCents) }]);
  });
}

export async function rejectWithdrawal(prisma: PrismaClient, actor: Actor | null, withdrawalId: string, reason: string, now = new Date()) {
  const note = reason.trim().replace(/\s+/g, " ").slice(0, 300);
  if (!note) throw new WithdrawalDecisionError("Escreva o motivo da recusa (a creator vê).");
  const w = await load(prisma, withdrawalId);
  // Em análise: quem aprova recusa. Aprovado: quem paga recusa (ex.: Pix com erro). Super admin pode os dois.
  if (w.status !== "REQUESTED" && w.status !== "APPROVED") throw new WithdrawalDecisionError(CHANGED);
  if (w.status === "APPROVED") assertManage(actor, w.brandId);
  else assertApprove(actor, w.brandId);
  await prisma.$transaction(async (tx) => {
    const { count } = await tx.withdrawal.updateMany({
      where: { id: w.id, status: w.status },
      data: { status: "REJECTED", decidedAt: now, decidedById: actor.userId, note },
    });
    if (count === 0) throw new WithdrawalDecisionError(CHANGED);
    await tx.auditLog.create({
      data: { brandId: w.brandId, actorType: "USER", actorId: actor.userId, action: "withdrawal.rejected", entity: "Withdrawal", entityId: w.id, after: { note } },
    });
    await notify(tx, [{ brandId: w.brandId, creatorId: w.creatorId, notice: notices.withdrawalRejected(w.id, w.amountCents, note) }]);
  });
}

export async function cancelMyWithdrawal(prisma: PrismaClient, ctx: PortalContext, actorUserId: string, withdrawalId: string, now = new Date()) {
  if (ctx.viewAs) throw new WithdrawalDecisionError("Visualização da equipe: nada é alterado em nome da creator.");
  const w = await load(prisma, withdrawalId);
  if (w.creatorId !== ctx.creatorId) throw new WithdrawalDecisionError("Saque não encontrado.");
  await prisma.$transaction(async (tx) => {
    const { count } = await tx.withdrawal.updateMany({
      where: { id: w.id, status: "REQUESTED" },
      data: { status: "CANCELLED", decidedAt: now, decidedById: actorUserId },
    });
    if (count === 0) throw new WithdrawalDecisionError(CHANGED);
    await tx.auditLog.create({
      data: { brandId: w.brandId, actorType: "USER", actorId: actorUserId, action: "withdrawal.cancelled", entity: "Withdrawal", entityId: w.id, after: {} },
    });
  });
}

export type QueueFilter = "REQUESTED" | "APPROVED" | "DECIDED";

/**
 * Fila do Pagamento: pedidos em análise (mais antigos primeiro) ou os já decididos (mais recentes primeiro).
 * Para cada pedido em análise, o disponível da creator **antes** deste pedido, para conferir se o valor cabe.
 */
export async function withdrawalQueue(prisma: PrismaClient, actor: Actor | null, filter: QueueFilter = "REQUESTED", now = new Date()) {
  if (!actor) throw new WithdrawalDecisionError("Sem permissão para saques.");
  const brands = brandsWith(actor.grants, "withdrawals.view");
  if (brands !== "ALL" && brands.length === 0) throw new WithdrawalDecisionError("Sem permissão para saques.");
  const rows = await prisma.withdrawal.findMany({
    where: {
      ...(brands === "ALL" ? {} : { brandId: { in: brands } }),
      status: filter === "DECIDED" ? { notIn: ["REQUESTED", "APPROVED"] } : filter,
    },
    orderBy: filter === "DECIDED" ? { decidedAt: "desc" } : filter === "APPROVED" ? { approvedAt: "asc" } : { requestedAt: "asc" },
    take: 200,
    select: {
      id: true,
      brandId: true,
      creatorId: true,
      amountCents: true,
      status: true,
      requestedAt: true,
      decidedAt: true,
      approvedAt: true,
      note: true,
      nfFileId: true,
      nfCheck: true,
      method: true,
      creator: { select: { account: { select: { name: true, cpf: true, cnpj: true, pixKey: true } } } },
    },
  });
  const isOpen = (s: string) => s === "REQUESTED" || s === "APPROVED";
  const ids = [...new Set(rows.filter((r) => isOpen(r.status)).map((r) => r.creatorId))];
  const brandTz = new Map(
    (await prisma.brand.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.brandId))] } }, select: { id: true, timezone: true } })).map((b) => [b.id, b.timezone]),
  );
  const [entries, open, released] = ids.length
    ? await Promise.all([
        Promise.all([...brandTz].map(([brandId, tz]) => ledgerEntriesWithMonth(prisma, ids.filter((id) => rows.some((r) => r.creatorId === id && r.brandId === brandId)), tz))).then((x) => x.flat()),
        prisma.withdrawal.findMany({ where: { creatorId: { in: ids }, status: { in: ["REQUESTED", "APPROVED"] } }, select: { creatorId: true, amountCents: true } }),
        releasedThroughFor(prisma, ids),
      ])
    : [[], [], new Map<string, string | null>()];
  return rows.map((r) => {
    const fiscal = can(actor.grants, "personal.fiscal", r.brandId);
    const a = r.creator.account;
    let availableBeforeCents: number | null = null;
    if (isOpen(r.status)) {
      const b = computeBalance(
        entries.filter((e) => e.creatorId === r.creatorId),
        open.filter((o) => o.creatorId === r.creatorId),
        now,
        { releasedThrough: released.get(r.creatorId) ?? null },
      );
      availableBeforeCents = b.availableCents + r.amountCents;
    }
    return {
      id: r.id,
      brandId: r.brandId,
      creatorId: r.creatorId,
      name: a.name,
      document: fiscal ? (a.cnpj ?? a.cpf) : null,
      pixKey: fiscal ? a.pixKey : null,
      amountCents: r.amountCents,
      status: r.status,
      requestedAt: r.requestedAt,
      decidedAt: r.decidedAt,
      approvedAt: r.approvedAt,
      note: r.note,
      hasNf: r.nfFileId !== null,
      nfCheck: r.nfCheck,
      individual: r.method === "RECEIPT_PIX",
      availableBeforeCents,
      // O que esta pessoa pode fazer neste saque (a tela só mostra os botões certos; a regra vale de novo no servidor).
      canApprove: r.status === "REQUESTED" && can(actor.grants, "withdrawals.approve", r.brandId),
      canPay: r.status === "APPROVED" && can(actor.grants, "withdrawals.manage", r.brandId),
      canRecheck: isOpen(r.status) && r.nfFileId !== null && (can(actor.grants, "withdrawals.approve", r.brandId) || can(actor.grants, "withdrawals.manage", r.brandId)),
    };
  });
}

/** Caminho da NF no Storage, só para quem vê saques da marca (Gestão e Pagamento). */
export async function nfLocation(prisma: PrismaClient, actor: Actor | null, withdrawalId: string) {
  const w = await prisma.withdrawal.findUnique({ where: { id: withdrawalId }, select: { brandId: true, nfFile: { select: { bucket: true, path: true } } } });
  if (!w || !w.nfFile) throw new WithdrawalDecisionError("Nota fiscal não encontrada.");
  assertView(actor, w.brandId);
  return w.nfFile;
}

/**
 * "Conferir de novo" (M1.1): lê a nota do pedido em aberto outra vez com as regras de hoje (tomadora, valor, emissor,
 * código do serviço) e grava o selo. Nota que passa vira "nota conferida"; o que não bate volta como lista de motivos e
 * o selo fica "conferir a nota". Quem aprova ou quem paga pode pedir; vai para a auditoria.
 */
export async function recheckWithdrawalNf(prisma: PrismaClient, actor: Actor | null, withdrawalId: string, pdf: Uint8Array) {
  const w = await prisma.withdrawal.findUnique({
    where: { id: withdrawalId },
    select: {
      id: true,
      brandId: true,
      status: true,
      amountCents: true,
      nfFileId: true,
      nfCheck: true,
      brand: { select: { name: true, nfTakerDocument: true } },
      creator: { select: { account: { select: { cnpj: true } } } },
    },
  });
  if (!w || !w.nfFileId) throw new WithdrawalDecisionError("Nota fiscal não encontrada.");
  if (!actor || !(can(actor.grants, "withdrawals.approve", w.brandId) || can(actor.grants, "withdrawals.manage", w.brandId)))
    throw new WithdrawalDecisionError("Sem permissão para saques.");
  if (w.status !== "REQUESTED" && w.status !== "APPROVED") throw new WithdrawalDecisionError(CHANGED);
  const nf = checkNf(parseNfseText(await pdfText(pdf)), {
    takerDoc: w.brand.nfTakerDocument,
    takerName: w.brand.name,
    amountCents: w.amountCents,
    issuerDoc: w.creator.account.cnpj,
  });
  const nfCheck = nf.problems.length ? "MANUAL" : nf.status;
  await prisma.$transaction([
    prisma.withdrawal.update({ where: { id: w.id }, data: { nfCheck } }),
    prisma.auditLog.create({
      data: { brandId: w.brandId, actorType: "USER", actorId: actor.userId, action: "withdrawal.nf_recheck", entity: "Withdrawal", entityId: w.id, before: { nfCheck: w.nfCheck }, after: { nfCheck, problems: nf.problems } },
    }),
  ]);
  return { nfCheck, problems: nf.problems };
}

/** Recibo aceito pela creator pessoa física (D-PFRECEIPT), só para quem vê saques da marca; CPF só com `personal.fiscal`. */
export async function receiptFor(prisma: PrismaClient, actor: Actor | null, withdrawalId: string) {
  const w = await prisma.withdrawal.findUnique({ where: { id: withdrawalId }, select: { brandId: true, receipt: true } });
  if (!w || !w.receipt) throw new WithdrawalDecisionError("Recibo não encontrado.");
  assertView(actor, w.brandId);
  const r = w.receipt;
  if (can(actor.grants, "personal.fiscal", w.brandId)) return { body: r.body, acceptedAt: r.acceptedAt, ip: r.ip };
  const formatted = `${r.cpf.slice(0, 3)}.${r.cpf.slice(3, 6)}.${r.cpf.slice(6, 9)}-${r.cpf.slice(9)}`;
  return { body: r.body.replace(formatted, `***.${r.cpf.slice(3, 6)}.${r.cpf.slice(6, 9)}-**`), acceptedAt: r.acceptedAt, ip: r.ip };
}
