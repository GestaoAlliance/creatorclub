import type { PrismaClient } from "@/generated/prisma/client";
import { checkCalendar, checkExtension, monthKey, type CalendarDays } from "@/domain";
import type { Actor } from "@/lib/auth/actor";
import { brandsWith } from "@/lib/auth/permissions";

/**
 * D-CALENDAR: datas de pagamento da marca. Só super admin muda (resposta do responsável). Estender a janela vale só no
 * mês corrente: no dia 1 seguinte o worker volta ao fim normal (`revertWindowExtensions`). Tudo no histórico.
 */

export class CalendarError extends Error {}

const assertSuper = (actor: Actor | null): Actor => {
  if (!actor || brandsWith(actor.grants, "staff.manage") !== "ALL") throw new CalendarError("Só o super admin muda as datas.");
  return actor;
};

const SELECT = { id: true, timezone: true, withdrawalWindowStartDay: true, withdrawalWindowEndDay: true, withdrawalPayFromDay: true, withdrawalPayByDay: true, windowExtensionMonth: true, windowNormalEndDay: true } as const;

type Row = { timezone: string; withdrawalWindowStartDay: number; withdrawalWindowEndDay: number; withdrawalPayFromDay: number | null; withdrawalPayByDay: number; windowExtensionMonth: string | null; windowNormalEndDay: number | null };

/** As datas da marca (com a extensão do mês, se houver). */
export function calendarOf(b: Row, now = new Date()) {
  const extended = b.windowExtensionMonth !== null && b.windowExtensionMonth === monthKey(now, b.timezone);
  return {
    days: { start: b.withdrawalWindowStartDay, end: b.withdrawalWindowEndDay, payFrom: b.withdrawalPayFromDay, payBy: b.withdrawalPayByDay } satisfies CalendarDays,
    normalEnd: extended ? b.windowNormalEndDay! : b.withdrawalWindowEndDay,
    extended,
  };
}

/** Muda as datas normais da marca. Com extensão no mês, a extensão continua e o fim normal novo vale a partir do próximo mês. */
export async function updateCalendar(prisma: PrismaClient, actor: Actor | null, brandId: string, input: CalendarDays, now = new Date()) {
  const who = assertSuper(actor);
  const b = await prisma.brand.findUniqueOrThrow({ where: { id: brandId }, select: SELECT });
  const problems = checkCalendar(input);
  if (problems.length) throw new CalendarError(problems.join(" "));
  const cur = calendarOf(b, now);
  const keepExtension = cur.extended && b.withdrawalWindowEndDay > input.end && input.payBy > b.withdrawalWindowEndDay;
  await prisma.$transaction([
    prisma.brand.update({
      where: { id: brandId },
      data: keepExtension
        ? { withdrawalWindowStartDay: input.start, windowNormalEndDay: input.end, withdrawalPayFromDay: input.payFrom, withdrawalPayByDay: input.payBy }
        : { withdrawalWindowStartDay: input.start, withdrawalWindowEndDay: input.end, withdrawalPayFromDay: input.payFrom, withdrawalPayByDay: input.payBy, windowExtensionMonth: null, windowNormalEndDay: null },
    }),
    prisma.auditLog.create({ data: { brandId, actorType: "USER", actorId: who.userId, action: "brand.calendar", entity: "Brand", entityId: brandId, before: { ...cur.days, normalEnd: cur.normalEnd }, after: { ...input, keptExtension: keepExtension } } }),
  ]);
}

/** Estende a janela de pedido só neste mês, até `endDay`. */
export async function extendWindow(prisma: PrismaClient, actor: Actor | null, brandId: string, endDay: number, now = new Date()) {
  const who = assertSuper(actor);
  const b = await prisma.brand.findUniqueOrThrow({ where: { id: brandId }, select: SELECT });
  const cur = calendarOf(b, now);
  const problem = checkExtension(cur.days, cur.normalEnd, endDay);
  if (problem) throw new CalendarError(problem);
  const month = monthKey(now, b.timezone);
  await prisma.$transaction([
    prisma.brand.update({ where: { id: brandId }, data: { withdrawalWindowEndDay: endDay, windowExtensionMonth: month, windowNormalEndDay: cur.normalEnd } }),
    prisma.auditLog.create({ data: { brandId, actorType: "USER", actorId: who.userId, action: "brand.window_extended", entity: "Brand", entityId: brandId, before: { end: cur.days.end }, after: { month, end: endDay, normalEnd: cur.normalEnd } } }),
  ]);
}

/** Desfaz a extensão do mês (volta ao fim normal agora). */
export async function cancelExtension(prisma: PrismaClient, actor: Actor | null, brandId: string, now = new Date()) {
  const who = assertSuper(actor);
  const b = await prisma.brand.findUniqueOrThrow({ where: { id: brandId }, select: SELECT });
  if (b.windowExtensionMonth === null) throw new CalendarError("A janela deste mês não está estendida.");
  await prisma.$transaction([
    prisma.brand.update({ where: { id: brandId }, data: { withdrawalWindowEndDay: b.windowNormalEndDay!, windowExtensionMonth: null, windowNormalEndDay: null } }),
    prisma.auditLog.create({ data: { brandId, actorType: "USER", actorId: who.userId, action: "brand.window_restored", entity: "Brand", entityId: brandId, before: { end: b.withdrawalWindowEndDay }, after: { end: b.windowNormalEndDay, at: now.toISOString() } } }),
  ]);
}

/** Worker: extensão de um mês que já passou volta ao fim normal (uma vez; fica no histórico). Devolve quantas voltaram. */
export async function revertWindowExtensions(prisma: PrismaClient, now = new Date()): Promise<number> {
  const brands = await prisma.brand.findMany({ where: { windowExtensionMonth: { not: null } }, select: SELECT });
  let n = 0;
  for (const b of brands) {
    if (b.windowExtensionMonth! >= monthKey(now, b.timezone)) continue;
    const { count } = await prisma.brand.updateMany({ where: { id: b.id, windowExtensionMonth: b.windowExtensionMonth }, data: { withdrawalWindowEndDay: b.windowNormalEndDay!, windowExtensionMonth: null, windowNormalEndDay: null } });
    if (!count) continue;
    n++;
    await prisma.auditLog.create({ data: { brandId: b.id, actorType: "SYSTEM", actorId: "worker:calendar", action: "brand.window_restored", entity: "Brand", entityId: b.id, before: { end: b.withdrawalWindowEndDay, month: b.windowExtensionMonth }, after: { end: b.windowNormalEndDay } } });
  }
  return n;
}
