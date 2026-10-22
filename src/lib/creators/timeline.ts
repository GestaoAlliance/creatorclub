import type { PrismaClient } from "@/generated/prisma/client";
import { formatBRL, PAID_FINANCIAL, REFUNDED_FINANCIAL } from "@/domain";
import type { Actor } from "@/lib/auth/actor";
import { can } from "@/lib/auth/permissions";

/**
 * Ficha da creator, M0.2 (docs/PLANO-MELHORIAS.md): números dos últimos 30 dias, vendas aguardando pagamento e estornos,
 * e a linha do tempo (tudo o que aconteceu com ela, das tabelas de cada assunto) com as observações da equipe.
 * Valores só para quem tem `money.view`; observações: ver com `creators.view`, escrever com `creators.edit`.
 */

export class NoteError extends Error {}

export const NOTE_MAX = 1000;
const DAY = 86_400_000;

/** Números da ficha: últimos 30 dias (vendas pagas), aguardando pagamento (estimativa pela taxa de hoje) e estornos. */
export async function creatorNumbers(prisma: PrismaClient, creatorId: string, now = new Date()) {
  const notCancelled = { cancelledAt: null, test: false };
  const [last30, pending, reversed, policy] = await Promise.all([
    prisma.order.aggregate({
      where: { attribution: { creatorId }, ...notCancelled, financialStatus: { in: [...PAID_FINANCIAL] }, paidAt: { gte: new Date(now.getTime() - 30 * DAY) } },
      _sum: { subtotalCents: true },
      _count: true,
    }),
    prisma.order.aggregate({
      where: { attribution: { creatorId }, ...notCancelled, financialStatus: { notIn: [...PAID_FINANCIAL, ...REFUNDED_FINANCIAL] } },
      _sum: { subtotalCents: true },
      _count: true,
    }),
    prisma.ledgerEntry.aggregate({ where: { creatorId, type: "REVERSAL" }, _sum: { amountCents: true } }),
    prisma.commissionPolicy.findFirst({
      where: { creatorId, confirmedAt: { not: null }, validFrom: { lte: now }, OR: [{ validTo: null }, { validTo: { gt: now } }] },
      select: { rateBps: true },
    }),
  ]);
  const salesCents = last30._sum.subtotalCents ?? 0;
  const pendingCents = pending._sum.subtotalCents ?? 0;
  return {
    last30: { salesCents, orders: last30._count, ticketCents: last30._count ? Math.round(salesCents / last30._count) : 0 },
    pending: {
      orders: pending._count,
      salesCents: pendingCents,
      // Estimativa: a taxa só congela no pagamento (D-PAIDAT).
      commissionCents: policy ? Math.round((pendingCents * policy.rateBps) / 10_000) : null,
    },
    reversedCents: Math.abs(reversed._sum.amountCents ?? 0),
  };
}

export type TimelineKind = "signup" | "approval" | "invite" | "contract" | "coupon" | "rate" | "sale" | "release" | "shipment" | "withdrawal" | "status" | "note";
export type TimelineEvent = { at: Date; kind: TimelineKind; title: string; detail?: string | null };

const pct = (bps: number) => `${(bps / 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
const SHIP: Record<string, string> = { AWAITING_APPROVAL: "Kit pedido (aguarda aprovação)", PREPARING: "Envio criado", SHIPPED: "Envio a caminho", DELIVERED: "Envio entregue", CANCELLED: "Envio cancelado" };

/** Linha do tempo da creator, mais recente primeiro (até `limit` acontecimentos). */
export async function creatorTimeline(prisma: PrismaClient, actor: Actor, creatorId: string, limit = 80): Promise<TimelineEvent[]> {
  const creator = await prisma.creator.findUniqueOrThrow({
    where: { id: creatorId },
    select: { brandId: true, accountId: true, createdAt: true, activatedAt: true, deactivatedAt: true, reviewedAt: true, withdrawalsUnlockedAt: true },
  });
  const money = can(actor.grants, "money.view", creator.brandId);
  const [apps, invites, autentique, signatures, assignments, policies, firstSale, releases, shipments, withdrawals, notes] = await Promise.all([
    prisma.creatorApplication.findMany({ where: { creatorId }, select: { submittedAt: true, decidedAt: true, source: true } }),
    prisma.creatorInvite.findMany({ where: { accountId: creator.accountId }, select: { createdAt: true, acceptedAt: true } }),
    prisma.contractRequest.findMany({ where: { creatorId }, select: { sentAt: true, signedAt: true, rejectedAt: true, sandbox: true } }),
    prisma.contractSignature.findMany({ where: { creatorId }, select: { signedAt: true } }),
    prisma.couponAssignment.findMany({ where: { creatorId }, select: { validFrom: true, validTo: true, coupon: { select: { code: true } } } }),
    money ? prisma.commissionPolicy.findMany({ where: { creatorId }, select: { validFrom: true, rateBps: true, confirmedAt: true } }) : [],
    prisma.order.findFirst({ where: { attribution: { creatorId }, paidAt: { not: null }, cancelledAt: null, test: false }, orderBy: { paidAt: "asc" }, select: { paidAt: true, name: true } }),
    money ? prisma.commissionRelease.findMany({ where: { creatorId }, select: { releasedAt: true, month: true, salesCents: true } }) : [],
    prisma.shipment.findMany({ where: { creatorId }, select: { createdAt: true, shippedAt: true, deliveredAt: true, cancelledAt: true, status: true, trackingCode: true } }),
    money ? prisma.withdrawal.findMany({ where: { creatorId }, select: { requestedAt: true, decidedAt: true, status: true, amountCents: true } }) : [],
    prisma.creatorNote.findMany({ where: { creatorId }, orderBy: { createdAt: "desc" }, take: 50, select: { createdAt: true, body: true, author: { select: { name: true } } } }),
  ]);

  const ev: TimelineEvent[] = [];
  const add = (at: Date | null | undefined, kind: TimelineKind, title: string, detail?: string | null) => {
    if (at) ev.push({ at, kind, title, detail: detail ?? null });
  };
  for (const a of apps) {
    add(a.submittedAt, "signup", a.source === "site_form" ? "Cadastro pelo site" : "Inscrição pelo formulário");
    add(a.decidedAt, "approval", "Inscrição aprovada");
  }
  add(creator.createdAt, "status", "Entrou no Creator Club");
  add(creator.deactivatedAt, "status", "Participação encerrada");
  add(creator.reviewedAt, "approval", "Números conferidos pela Ana");
  add(creator.withdrawalsUnlockedAt, "approval", "Saque liberado");
  for (const i of invites) {
    add(i.createdAt, "invite", "Convite do portal gerado");
    add(i.acceptedAt, "invite", "Entrou no portal pela primeira vez");
  }
  for (const c of autentique) {
    add(c.sentAt, "contract", "Contrato enviado pelo Autentique", c.sandbox ? "modo teste" : null);
    add(c.signedAt, "contract", "Contrato assinado no Autentique");
    add(c.rejectedAt, "contract", "Contrato recusado no Autentique");
  }
  for (const s of signatures) add(s.signedAt, "contract", "Contrato assinado no portal");
  for (const a of assignments) {
    add(a.validFrom, "coupon", `Cupom ${a.coupon.code} passou a ser dela`);
    add(a.validTo, "coupon", `Cupom ${a.coupon.code} deixou de ser dela`);
  }
  for (const p of policies) add(p.validFrom, "rate", `Comissão de ${pct(p.rateBps)}`, p.confirmedAt ? null : "a confirmar pela Ana");
  if (firstSale?.paidAt) add(firstSale.paidAt, "sale", "Primeira venda paga", firstSale.name);
  for (const r of releases) add(r.releasedAt, "release", `Comissão liberada até ${r.month.slice(5)}/${r.month.slice(0, 4)}`, `vendas ${formatBRL(r.salesCents)}`);
  for (const s of shipments) {
    add(s.createdAt, "shipment", s.status === "AWAITING_APPROVAL" ? SHIP.AWAITING_APPROVAL! : SHIP.PREPARING!);
    add(s.shippedAt, "shipment", SHIP.SHIPPED!, s.trackingCode);
    add(s.deliveredAt, "shipment", SHIP.DELIVERED!);
    add(s.cancelledAt, "shipment", SHIP.CANCELLED!);
  }
  for (const w of withdrawals) {
    add(w.requestedAt, "withdrawal", `Pediu saque de ${formatBRL(w.amountCents)}`);
    if (w.status === "PAID") add(w.decidedAt, "withdrawal", `Saque de ${formatBRL(w.amountCents)} pago`);
    if (w.status === "REJECTED") add(w.decidedAt, "withdrawal", `Saque de ${formatBRL(w.amountCents)} recusado`);
    if (w.status === "CANCELLED") add(w.decidedAt, "withdrawal", "Cancelou o pedido de saque");
  }
  for (const n of notes) add(n.createdAt, "note", n.body, n.author.name);
  return ev.sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, limit);
}

/** Observação da equipe na ficha (só inserção). */
export async function addCreatorNote(prisma: PrismaClient, actor: Actor | null, creatorId: string, raw: string, now = new Date()) {
  const creator = await prisma.creator.findUnique({ where: { id: creatorId }, select: { brandId: true } });
  if (!creator) throw new NoteError("Creator não encontrada.");
  if (!actor || !can(actor.grants, "creators.edit", creator.brandId)) throw new NoteError("Sem permissão.");
  const body = raw.replace(/\r\n/g, "\n").trim();
  if (!body) throw new NoteError("Escreva a observação.");
  if (body.length > NOTE_MAX) throw new NoteError(`A observação pode ter até ${NOTE_MAX} caracteres.`);
  return prisma.creatorNote.create({ data: { brandId: creator.brandId, creatorId, authorId: actor.userId, body, createdAt: now } });
}
