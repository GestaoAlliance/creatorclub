import type { PrismaClient } from "@/generated/prisma/client";
import {
  accumulatedSales,
  ACTION_OWNER,
  actionRank,
  BIRTHDAY_WARN_DAYS,
  actionDetail,
  actionMessage,
  CONTRACT_WARN_DAYS,
  dayKey,
  isUgcOnly,
  KIT_PENDING_DAYS,
  monthKey,
  nextBirthday,
  releaseMinFor,
  SHIP_STUCK_DAYS,
  startOfLocalDay,
  UNSIGNED_DAYS,
  whatsappChatUrl,
  whatsappWithText,
  TEAM_MESSAGE_MAX,
  type ActionFacts,
  type ActionKind,
  type Notice,
} from "@/domain";
import type { Actor } from "@/lib/auth/actor";
import { can } from "@/lib/auth/permissions";
import { releaseAmountsByMonth, releasedThroughFor } from "@/lib/commission/release";
import { dayOf } from "@/lib/creators/contract";
import { IDLE_SELECT, idleFor } from "@/lib/creators/idle";
import { notify } from "@/lib/notifications/notify";
import { withdrawBlocks } from "@/lib/payouts/withdraw-blocks";

/**
 * Fila de ações por creator (M2.1, D-ACTIONS). Montada na hora a partir dos dados (nada fica "aberto" no banco):
 * - parou de vender: ativa há 60 dias ou mais sem venda (D-IDLE60);
 * - contrato vencendo: fim em até 30 dias ou já vencido (creator não desligada);
 * - perto do mínimo: passou de 70% do mínimo de vendas do mês e ainda não chegou (como o aviso NEAR_MINIMUM);
 * - kit sem escolher: kit liberado há 7 dias ou mais;
 * - envio parado: em preparação há 3 dias ou mais (tarefa de quem envia);
 * - aniversário: de 3 dias antes até o dia (M4.2, D-TAGS), com a mensagem de parabéns;
 * - sem post: parceira ativa sem post registrado há 15 dias (M4.6, D-POSTS; conta desde o início dos registros);
 * - contrato sem assinar: aprovada esperando o contrato do Autentique enviado há 7 dias ou mais (D-CONTRACTREMIND);
 * - pediu acesso: já tinha cadastro sem senha e pediu o link pelo site (D-ACCESSREQ); sai quando ela ganha o login ou
 *   a equipe gera um convite depois do pedido.
 * Resolvido o motivo, a tarefa some sozinha. "Feito" grava a ocorrência em `ActionDone` e ela sai da fila; uma
 * ocorrência nova (outro mês, outro fim de contrato, outro kit) volta.
 */

const NEAR_MIN_SHARE = 0.7;
const DAY = 86_400_000;

export class ActionError extends Error {}

export type ActionTask = {
  key: string;
  kind: ActionKind;
  owner: "GESTAO" | "ENVIO";
  creatorId: string;
  name: string;
  detail: string;
  /** Mensagem pronta e o link do WhatsApp com ela (sem telefone válido, só o texto). */
  message: string | null;
  whatsappUrl: string | null;
  /** D-ACTIONSBOARD: ordem na fila (menor = mais urgente) e o tom. */
  rank: number;
  tone: "urgent" | "warn" | "info";
  /** Telefone que o WhatsApp da marca consegue usar (celular do Brasil). */
  hasPhone: boolean;
};

export async function actionQueue(prisma: PrismaClient, brandId: string, now = new Date()): Promise<ActionTask[]> {
  const brand = await prisma.brand.findUniqueOrThrow({
    where: { id: brandId },
    select: { name: true, slug: true, timezone: true, releaseMinCents: true, releaseMinPrescriberCents: true, releaseBasis: true },
  });
  const tz = brand.timezone;
  const today = Date.parse(`${dayKey(now, tz)}T00:00:00Z`);
  const month = monthKey(now, tz);

  const [creators, kits, ships, done, unsigned] = await Promise.all([
    prisma.creator.findMany({
      where: { brandId, status: { not: "DEACTIVATED" } },
      select: {
        ...IDLE_SELECT,
        categories: true,
        contractEnd: true,
        account: { select: { name: true, phone: true, birthDate: true, userId: true, accessRequestedAt: true, invites: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } } } },
      },
    }),
    // D-PRODUCTPAUSE: marca com os pedidos pausados não cobra a escolha do kit.
    prisma.kitGrant.findMany({ where: { brandId, status: "PENDING", brand: { productRequestsPausedAt: null }, createdAt: { lte: new Date(now.getTime() - KIT_PENDING_DAYS * DAY) } }, select: { id: true, creatorId: true, createdAt: true } }),
    prisma.shipment.findMany({
      where: { brandId, status: "PREPARING", createdAt: { lte: new Date(now.getTime() - SHIP_STUCK_DAYS * DAY) } },
      select: { id: true, creatorId: true, createdAt: true, approvedAt: true },
    }),
    prisma.actionDone.findMany({ where: { brandId }, select: { key: true } }),
    prisma.contractRequest.findMany({
      where: { brandId, status: "SENT", sentAt: { lte: new Date(now.getTime() - UNSIGNED_DAYS * DAY) }, creator: { awaitingContractAt: { not: null }, contractSigned: false } },
      select: { id: true, creatorId: true, sentAt: true, signLink: true },
    }),
  ]);
  const byId = new Map(creators.map((c) => [c.id, c]));
  const skip = new Set(done.map((d) => d.key));
  const out: ActionTask[] = [];
  const push = (creatorId: string, key: string, facts: ActionFacts) => {
    const c = byId.get(creatorId);
    if (!c || skip.has(key)) return;
    const message = actionMessage(facts, c.account.name, brand.name);
    const chat = whatsappChatUrl(c.account.phone);
    out.push({
      key,
      kind: facts.kind,
      owner: ACTION_OWNER[facts.kind],
      creatorId,
      name: c.account.name,
      detail: actionDetail(facts),
      message,
      whatsappUrl: message && chat ? whatsappWithText(chat, message) : null,
      ...actionRank(facts),
      hasPhone: chat !== null,
    });
  };
  const days = (d: Date) => Math.floor((now.getTime() - d.getTime()) / DAY);

  // Parou de vender (só ativas com contrato de comissão; a regra está em `idleFor`).
  for (const [id, s] of await idleFor(prisma, creators, tz, now)) if (s?.idle) push(id, `IDLE:${id}:${s.lastSaleDay ?? "nunca"}`, { kind: "IDLE", days: s.days, contractEnds: brand.slug === "revita-derma" || brand.slug === "vermefree" });

  // Contrato vencendo ou vencido. D-REVITARULES: na Revita o contrato é sem prazo (encerra com 2 meses sem venda).
  for (const c of brand.slug === "revita-derma" ? [] : creators) {
    const endDay = dayOf(c.contractEnd);
    if (!endDay) continue;
    const left = (Date.parse(`${endDay}T00:00:00Z`) - today) / DAY;
    if (left <= CONTRACT_WARN_DAYS) push(c.id, `CONTRACT:${c.id}:${endDay}`, { kind: "CONTRACT", endDay, expired: left <= 0 });
  }

  // Perto do mínimo do mês (parceiras ativas com comissão).
  const partners = creators.filter((c) => c.status === "ACTIVE" && !isUgcOnly(c.categories));
  const ids = partners.map((c) => c.id);
  const [sales, released] = await Promise.all([releaseAmountsByMonth(prisma, ids, tz, brand.releaseBasis), releasedThroughFor(prisma, ids)]);
  for (const c of partners) {
    const min = releaseMinFor(c.categories, brand, c.contractTemplate);
    if (!min) continue;
    const acc = accumulatedSales(sales.get(c.id)!, released.get(c.id) ?? null, month);
    if (acc >= min * NEAR_MIN_SHARE && acc < min) push(c.id, `NEAR_MIN:${c.id}:${month}`, { kind: "NEAR_MIN", missingCents: min - acc, commission: brand.releaseBasis === "COMMISSION" });
  }

  // Aniversário (creators não desligadas com data de nascimento).
  const todayKey = dayKey(now, tz);
  for (const c of creators) {
    if (!c.account.birthDate) continue;
    const next = nextBirthday(c.account.birthDate.toISOString().slice(0, 10), todayKey);
    if (next.days <= BIRTHDAY_WARN_DAYS) push(c.id, `BIRTHDAY:${c.id}:${next.day}`, { kind: "BIRTHDAY", day: next.day, days: next.days });
  }

  // D-NOPOSTQUEUE (responsável, 2026-11-19): "Sem post" saiu da fila (gerava ruído: 76 na Botanika, 46 na VermeFree sem
  // Instagram ligado). Fica só a lista "Sem post" em Creators → Conteúdo.

  // Pediu o link de acesso pelo site (D-ACCESSREQ).
  for (const c of creators) {
    const at = c.account.accessRequestedAt;
    if (!at || c.account.userId) continue;
    const invited = c.account.invites[0]?.createdAt;
    if (invited && invited >= at) continue;
    push(c.id, `ACCESS:${c.id}:${at.toISOString()}`, { kind: "ACCESS", day: dayKey(at, tz) });
  }

  for (const k of kits) push(k.creatorId, `KIT_PENDING:${k.id}`, { kind: "KIT_PENDING", days: days(k.createdAt) });
  for (const u of unsigned) if (u.creatorId) push(u.creatorId, `UNSIGNED:${u.id}`, { kind: "UNSIGNED", days: days(u.sentAt), link: u.signLink });
  for (const s of ships) push(s.creatorId, `SHIP_STUCK:${s.id}`, { kind: "SHIP_STUCK", days: days(s.approvedAt ?? s.createdAt) });
  // D-CANTWITHDRAW: tem saldo liberado e alguma trava impede o saque (some sozinha quando resolve ou quando saca).
  for (const [id, b] of await withdrawBlocks(prisma, brandId, now)) push(id, `CANT_WITHDRAW:${id}:${month}:${b.reasons.join("+")}`, { kind: "CANT_WITHDRAW", availableCents: b.availableCents, reasons: b.reasons });
  // D-DATAFIX: pedidos de correção feitos no portal (até "Feito").
  const fixes = await prisma.dataFixRequest.findMany({ where: { brandId, createdAt: { gte: new Date(now.getTime() - 90 * DAY) } }, select: { id: true, creatorId: true, field: true, message: true, createdAt: true } });
  for (const f of fixes) push(f.creatorId, `FIX_DATA:${f.id}`, { kind: "FIX_DATA", day: dayKey(f.createdAt, tz), field: f.field, message: f.message });

  return out.sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name, "pt-BR"));
}

/** Quem vê a fila: a Gestão vê tudo; quem envia vê os envios parados. */
export function visibleTasks(tasks: ActionTask[], actor: Actor, brandId: string): ActionTask[] {
  const gestao = can(actor.grants, "creators.edit", brandId);
  const envio = can(actor.grants, "shipping.manage", brandId);
  return tasks.filter((t) => (t.owner === "GESTAO" ? gestao : gestao || envio));
}

/** "Feito": a ocorrência sai da fila (só quem cuida daquele tipo; só tarefa que está na fila agora). */
export async function markActionDone(prisma: PrismaClient, actor: Actor | null, brandId: string, key: string, now = new Date()) {
  if (!actor) throw new ActionError("Sem permissão.");
  const task = visibleTasks(await actionQueue(prisma, brandId, now), actor, brandId).find((t) => t.key === key);
  if (!task) throw new ActionError("Esta tarefa já saiu da fila. Atualize a página.");
  await prisma.$transaction([
    prisma.actionDone.createMany({ data: [{ brandId, creatorId: task.creatorId, key, doneAt: now, doneById: actor.userId }], skipDuplicates: true }),
    prisma.auditLog.create({ data: { brandId, actorType: "USER", actorId: actor.userId, action: "action.done", entity: "Creator", entityId: task.creatorId, after: { key, kind: task.kind } } }),
  ]);
}

/** D-ACTIONSBOARD: quantas tarefas a equipe concluiu hoje (dia de São Paulo) na marca. */
export async function actionsDoneToday(prisma: PrismaClient, brandId: string, now = new Date()): Promise<number> {
  const brand = await prisma.brand.findUniqueOrThrow({ where: { id: brandId }, select: { timezone: true } });
  const start = startOfLocalDay(dayKey(now, brand.timezone), brand.timezone);
  return prisma.actionDone.count({ where: { brandId, doneAt: { gte: start } } });
}

/**
 * D-ACTIONSBOARD: manda as mensagens das tarefas pelo WhatsApp da marca (aviso no portal + WhatsApp; sem WhatsApp na
 * marca, e-mail) e marca as tarefas como feitas. Só a Gestão; só tarefas na fila agora e com mensagem; o texto pode
 * ter sido ajustado (vale só para este envio). Uma vez por tarefa (a chave do aviso é a da tarefa).
 */
export async function sendActionMessages(prisma: PrismaClient, actor: Actor | null, brandId: string, items: { key: string; title: string; text: string }[], now = new Date()) {
  if (!actor || !can(actor.grants, "creators.edit", brandId)) throw new ActionError("Sem permissão.");
  if (!items.length) throw new ActionError("Nenhuma tarefa escolhida.");
  if (items.length > 300) throw new ActionError("No máximo 300 de uma vez.");
  const queue = new Map((await actionQueue(prisma, brandId, now)).map((t) => [t.key, t]));
  const rows: { brandId: string; creatorId: string; notice: Notice; key: string; kind: ActionKind }[] = [];
  for (const it of items) {
    const t = queue.get(it.key);
    if (!t || !t.message || t.owner !== "GESTAO") continue;
    const title = it.title.trim().slice(0, TEAM_MESSAGE_MAX.title);
    const text = it.text.trim().slice(0, TEAM_MESSAGE_MAX.body);
    if (!title || !text) throw new ActionError("Escreva o título e a mensagem.");
    rows.push({ brandId, creatorId: t.creatorId, key: t.key, kind: t.kind, notice: { kind: "TEAM_MESSAGE", dedupeKey: `action:${t.key}`, title, body: text, path: null } });
  }
  if (!rows.length) throw new ActionError("Estas tarefas já saíram da fila. Atualize a página.");
  return prisma.$transaction(async (tx) => {
    const sent = await notify(tx, rows);
    await tx.actionDone.createMany({ data: rows.map((r) => ({ brandId, creatorId: r.creatorId, key: r.key, doneAt: now, doneById: actor.userId })), skipDuplicates: true });
    await tx.auditLog.createMany({
      data: rows.map((r) => ({ brandId, actorType: "USER" as const, actorId: actor.userId, action: "action.sent", entity: "Creator", entityId: r.creatorId, after: { key: r.key, kind: r.kind, title: r.notice.title, text: r.notice.body } })),
    });
    const brand = await tx.brand.findUniqueOrThrow({ where: { id: brandId }, select: { whatsappInstance: true } });
    return { sent, whatsapp: brand.whatsappInstance !== null };
  });
}
