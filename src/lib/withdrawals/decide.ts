import type { PrismaClient } from "@/generated/prisma/client";
import { computeBalance } from "@/domain";
import type { Actor } from "@/lib/auth/actor";
import { brandsWith, can } from "@/lib/auth/permissions";
import { ledgerEntriesWithMonth, releasedThroughFor } from "@/lib/commission/release";
import type { PortalContext } from "@/lib/portal/context";

/**
 * Decisão do saque (E8, D-WDDECIDE). O Pagamento (e o super admin) vê a fila com a nota fiscal e a chave Pix e:
 * - marca como **pago** (no dia do clique): o valor sai do extrato num lançamento WITHDRAWAL, uma vez só
 *   (`LedgerEntry_one_payment_per_withdrawal`); sem comprovante (combinado na reunião);
 * - **recusa** com motivo obrigatório (`Withdrawal_rejected_has_note`), que a creator vê na aba Saque.
 * A creator pode **cancelar** o próprio pedido enquanto está em análise. Toda decisão só vale a partir de
 * "Em análise" (dois cliques não pagam duas vezes) e vai para a auditoria.
 */

export class WithdrawalDecisionError extends Error {}

function assertManage(actor: Actor | null, brandId: string): asserts actor is Actor {
  if (!actor || !can(actor.grants, "withdrawals.manage", brandId)) throw new WithdrawalDecisionError("Sem permissão para saques.");
}

async function load(prisma: PrismaClient, id: string) {
  const w = await prisma.withdrawal.findUnique({ where: { id }, select: { id: true, brandId: true, creatorId: true, amountCents: true, status: true } });
  if (!w) throw new WithdrawalDecisionError("Saque não encontrado.");
  return w;
}

const CHANGED = "Este saque já foi decidido. Atualize a página.";

export async function payWithdrawal(prisma: PrismaClient, actor: Actor | null, withdrawalId: string, now = new Date()) {
  const w = await load(prisma, withdrawalId);
  assertManage(actor, w.brandId);
  await prisma.$transaction(async (tx) => {
    const { count } = await tx.withdrawal.updateMany({
      where: { id: w.id, status: "REQUESTED" },
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
  });
}

export async function rejectWithdrawal(prisma: PrismaClient, actor: Actor | null, withdrawalId: string, reason: string, now = new Date()) {
  const note = reason.trim().replace(/\s+/g, " ").slice(0, 300);
  if (!note) throw new WithdrawalDecisionError("Escreva o motivo da recusa (a creator vê).");
  const w = await load(prisma, withdrawalId);
  assertManage(actor, w.brandId);
  await prisma.$transaction(async (tx) => {
    const { count } = await tx.withdrawal.updateMany({
      where: { id: w.id, status: "REQUESTED" },
      data: { status: "REJECTED", decidedAt: now, decidedById: actor.userId, note },
    });
    if (count === 0) throw new WithdrawalDecisionError(CHANGED);
    await tx.auditLog.create({
      data: { brandId: w.brandId, actorType: "USER", actorId: actor.userId, action: "withdrawal.rejected", entity: "Withdrawal", entityId: w.id, after: { note } },
    });
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

export type QueueFilter = "REQUESTED" | "DECIDED";

/**
 * Fila do Pagamento: pedidos em análise (mais antigos primeiro) ou os já decididos (mais recentes primeiro).
 * Para cada pedido em análise, o disponível da creator **antes** deste pedido, para conferir se o valor cabe.
 */
export async function withdrawalQueue(prisma: PrismaClient, actor: Actor | null, filter: QueueFilter = "REQUESTED", now = new Date()) {
  if (!actor) throw new WithdrawalDecisionError("Sem permissão para saques.");
  const brands = brandsWith(actor.grants, "withdrawals.manage");
  if (brands !== "ALL" && brands.length === 0) throw new WithdrawalDecisionError("Sem permissão para saques.");
  const rows = await prisma.withdrawal.findMany({
    where: {
      ...(brands === "ALL" ? {} : { brandId: { in: brands } }),
      status: filter === "REQUESTED" ? "REQUESTED" : { not: "REQUESTED" },
    },
    orderBy: filter === "REQUESTED" ? { requestedAt: "asc" } : { decidedAt: "desc" },
    take: 200,
    select: {
      id: true,
      brandId: true,
      creatorId: true,
      amountCents: true,
      status: true,
      requestedAt: true,
      decidedAt: true,
      note: true,
      nfFileId: true,
      nfCheck: true,
      creator: { select: { account: { select: { name: true, cpf: true, cnpj: true, pixKey: true } } } },
    },
  });
  const ids = [...new Set(rows.filter((r) => r.status === "REQUESTED").map((r) => r.creatorId))];
  const brandTz = new Map(
    (await prisma.brand.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.brandId))] } }, select: { id: true, timezone: true } })).map((b) => [b.id, b.timezone]),
  );
  const [entries, open, released] = ids.length
    ? await Promise.all([
        Promise.all([...brandTz].map(([brandId, tz]) => ledgerEntriesWithMonth(prisma, ids.filter((id) => rows.some((r) => r.creatorId === id && r.brandId === brandId)), tz))).then((x) => x.flat()),
        prisma.withdrawal.findMany({ where: { creatorId: { in: ids }, status: "REQUESTED" }, select: { creatorId: true, amountCents: true } }),
        releasedThroughFor(prisma, ids),
      ])
    : [[], [], new Map<string, string | null>()];
  return rows.map((r) => {
    const fiscal = can(actor.grants, "personal.fiscal", r.brandId);
    const a = r.creator.account;
    let availableBeforeCents: number | null = null;
    if (r.status === "REQUESTED") {
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
      note: r.note,
      hasNf: r.nfFileId !== null,
      nfCheck: r.nfCheck,
      availableBeforeCents,
    };
  });
}

/** Caminho da NF no Storage, só para quem decide saques da marca. */
export async function nfLocation(prisma: PrismaClient, actor: Actor | null, withdrawalId: string) {
  const w = await prisma.withdrawal.findUnique({ where: { id: withdrawalId }, select: { brandId: true, nfFile: { select: { bucket: true, path: true } } } });
  if (!w || !w.nfFile) throw new WithdrawalDecisionError("Nota fiscal não encontrada.");
  assertManage(actor, w.brandId);
  return w.nfFile;
}
