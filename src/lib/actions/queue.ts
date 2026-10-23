import type { PrismaClient } from "@/generated/prisma/client";
import {
  accumulatedSales,
  ACTION_OWNER,
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
  whatsappChatUrl,
  whatsappWithText,
  type ActionFacts,
  type ActionKind,
} from "@/domain";
import type { Actor } from "@/lib/auth/actor";
import { can } from "@/lib/auth/permissions";
import { releasedThroughFor, salesByMonth } from "@/lib/commission/release";
import { dayOf } from "@/lib/creators/contract";
import { IDLE_SELECT, idleFor } from "@/lib/creators/idle";

/**
 * Fila de ações por creator (M2.1, D-ACTIONS). Montada na hora a partir dos dados (nada fica "aberto" no banco):
 * - parou de vender: ativa há 60 dias ou mais sem venda (D-IDLE60);
 * - contrato vencendo: fim em até 30 dias ou já vencido (creator não desligada);
 * - perto do mínimo: passou de 70% do mínimo de vendas do mês e ainda não chegou (como o aviso NEAR_MINIMUM);
 * - kit sem escolher: kit liberado há 7 dias ou mais;
 * - envio parado: em preparação há 3 dias ou mais (tarefa de quem envia);
 * - aniversário: de 3 dias antes até o dia (M4.2, D-TAGS), com a mensagem de parabéns.
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
};

export async function actionQueue(prisma: PrismaClient, brandId: string, now = new Date()): Promise<ActionTask[]> {
  const brand = await prisma.brand.findUniqueOrThrow({
    where: { id: brandId },
    select: { name: true, timezone: true, releaseMinCents: true, releaseMinPrescriberCents: true },
  });
  const tz = brand.timezone;
  const today = Date.parse(`${dayKey(now, tz)}T00:00:00Z`);
  const month = monthKey(now, tz);

  const [creators, kits, ships, done] = await Promise.all([
    prisma.creator.findMany({
      where: { brandId, status: { not: "DEACTIVATED" } },
      select: { ...IDLE_SELECT, categories: true, contractEnd: true, account: { select: { name: true, phone: true, birthDate: true } } },
    }),
    prisma.kitGrant.findMany({ where: { brandId, status: "PENDING", createdAt: { lte: new Date(now.getTime() - KIT_PENDING_DAYS * DAY) } }, select: { id: true, creatorId: true, createdAt: true } }),
    prisma.shipment.findMany({
      where: { brandId, status: "PREPARING", createdAt: { lte: new Date(now.getTime() - SHIP_STUCK_DAYS * DAY) } },
      select: { id: true, creatorId: true, createdAt: true, approvedAt: true },
    }),
    prisma.actionDone.findMany({ where: { brandId }, select: { key: true } }),
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
    });
  };
  const days = (d: Date) => Math.floor((now.getTime() - d.getTime()) / DAY);

  // Parou de vender (só ativas com contrato de comissão; a regra está em `idleFor`).
  for (const [id, s] of await idleFor(prisma, creators, tz, now)) if (s?.idle) push(id, `IDLE:${id}:${s.lastSaleDay ?? "nunca"}`, { kind: "IDLE", days: s.days });

  // Contrato vencendo ou vencido.
  for (const c of creators) {
    const endDay = dayOf(c.contractEnd);
    if (!endDay) continue;
    const left = (Date.parse(`${endDay}T00:00:00Z`) - today) / DAY;
    if (left <= CONTRACT_WARN_DAYS) push(c.id, `CONTRACT:${c.id}:${endDay}`, { kind: "CONTRACT", endDay, expired: left <= 0 });
  }

  // Perto do mínimo do mês (parceiras ativas com comissão).
  const partners = creators.filter((c) => c.status === "ACTIVE" && !isUgcOnly(c.categories));
  const ids = partners.map((c) => c.id);
  const [sales, released] = await Promise.all([salesByMonth(prisma, ids, tz), releasedThroughFor(prisma, ids)]);
  for (const c of partners) {
    const min = releaseMinFor(c.categories, brand, c.contractTemplate);
    if (!min) continue;
    const acc = accumulatedSales(sales.get(c.id)!, released.get(c.id) ?? null, month);
    if (acc >= min * NEAR_MIN_SHARE && acc < min) push(c.id, `NEAR_MIN:${c.id}:${month}`, { kind: "NEAR_MIN", missingCents: min - acc });
  }

  // Aniversário (creators não desligadas com data de nascimento).
  const todayKey = dayKey(now, tz);
  for (const c of creators) {
    if (!c.account.birthDate) continue;
    const next = nextBirthday(c.account.birthDate.toISOString().slice(0, 10), todayKey);
    if (next.days <= BIRTHDAY_WARN_DAYS) push(c.id, `BIRTHDAY:${c.id}:${next.day}`, { kind: "BIRTHDAY", day: next.day, days: next.days });
  }

  for (const k of kits) push(k.creatorId, `KIT_PENDING:${k.id}`, { kind: "KIT_PENDING", days: days(k.createdAt) });
  for (const s of ships) push(s.creatorId, `SHIP_STUCK:${s.id}`, { kind: "SHIP_STUCK", days: days(s.approvedAt ?? s.createdAt) });

  return out;
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
