import type { PrismaClient } from "@/generated/prisma/client";
import { addDaysKey, dayKey, weeklySummaryText } from "@/domain";
import { actionQueue } from "@/lib/actions/queue";
import { productReport } from "@/lib/reports/products";
import { staffDashboard } from "@/lib/staff/dashboard";
import { engagementDropCount } from "@/lib/instagram/ranking";
import { WhatsAppError, type WhatsAppSender } from "./whatsapp";

/**
 * Resumo semanal da gestão (M3.4, D-WEEKLY): toda segunda a partir das 9h (São Paulo), um resumo da semana anterior
 * de cada marca com WhatsApp ligado (`Brand.whatsappInstance`), pelo mesmo fluxo do n8n dos avisos, para quem tem
 * Gestão na marca e para o super admin, com o WhatsApp cadastrado em Equipe. `SummaryRun` garante um envio por marca,
 * semana e pessoa; falha do n8n libera para tentar no minuto seguinte (até as 20h).
 */

const TZ = "America/Sao_Paulo";
const START_HOUR = 9;
const END_HOUR = 20;
const PER_RUN = 5;

const hourIn = (now: Date) => Number(new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", hourCycle: "h23" }).format(now));
const weekdayIn = (now: Date) => new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short" }).format(now);

/** Semana anterior (segunda a domingo) a partir de uma segunda-feira. */
export function previousWeek(now: Date): { monday: string; from: string; to: string } {
  const monday = dayKey(now, TZ);
  return { monday, from: addDaysKey(monday, -7), to: addDaysKey(monday, -1) };
}

/** Monta o resumo de uma marca (sem enviar). */
export async function weeklySummary(prisma: PrismaClient, brand: { id: string; name: string }, week: { from: string; to: string }, origin: string | null, now = new Date()) {
  const period = { from: week.from, to: week.to, preset: "" };
  const [d, products, applications, toApprove, toPay, tasks, igDrops] = await Promise.all([
    staffDashboard(prisma, brand.id, period, "", now),
    productReport(prisma, brand.id, period),
    prisma.creatorApplication.count({ where: { brandId: brand.id, status: "NEW" } }),
    prisma.withdrawal.count({ where: { brandId: brand.id, status: "REQUESTED" } }),
    prisma.withdrawal.count({ where: { brandId: brand.id, status: "APPROVED" } }),
    actionQueue(prisma, brand.id, now),
    // D-INSTAGRAM: queda de engajamento de 40% ou mais.
    engagementDropCount(prisma, brand.id, now),
  ]);
  const count = (k: string) => tasks.filter((t) => t.kind === k).length;
  return weeklySummaryText({
    brand: brand.name,
    from: week.from,
    to: week.to,
    sales: { cents: d.kpis.sales.cents, change: d.kpis.sales.change, orders: d.kpis.sales.orders, storeShare: d.kpis.sales.storeShare },
    commissionCents: d.kpis.commission.cents,
    top: d.topCreators.slice(0, 3).map((c) => ({ name: c.name, cents: c.salesCents })),
    profit: products.program && products.productsWithCost > 0 ? { cents: products.program.profitCents, revenueCents: products.program.revenueCents } : null,
    pending: { applications, toApprove, toPay, actions: tasks.length },
    alerts: { idle: count("IDLE"), contracts: count("CONTRACT"), nearMin: count("NEAR_MIN"), kits: count("KIT_PENDING") + count("SHIP_STUCK"), igDrops },
    link: origin ? `${origin}/admin/marca` : null,
  });
}

/** Roda no worker: manda os resumos da semana que ainda não foram. Devolve quantos foram entregues ao n8n. */
export async function runWeeklySummaries(prisma: PrismaClient, sender: WhatsAppSender | null, origin: string | null, now = new Date()): Promise<number> {
  if (!sender || weekdayIn(now) !== "Mon" || hourIn(now) < START_HOUR || hourIn(now) >= END_HOUR) return 0;
  const week = previousWeek(now);
  const brands = await prisma.brand.findMany({ where: { archivedAt: null, whatsappInstance: { not: null } }, select: { id: true, name: true, slug: true, whatsappInstance: true } });
  let sent = 0;
  for (const brand of brands) {
    const people = await prisma.user.findMany({
      where: { disabledAt: null, phone: { not: null }, roleGrants: { some: { OR: [{ role: "GESTAO", brandId: brand.id }, { role: "SUPER_ADMIN", brandId: null }] } } },
      select: { id: true, phone: true },
    });
    const done = new Set((await prisma.summaryRun.findMany({ where: { key: { in: people.map((u) => `weekly:${brand.slug}:${week.monday}:${u.id}`) } }, select: { key: true } })).map((r) => r.key));
    const todo = people.filter((u) => !done.has(`weekly:${brand.slug}:${week.monday}:${u.id}`));
    if (!todo.length) continue;
    const text = await weeklySummary(prisma, brand, week, origin, now);
    for (const u of todo) {
      if (sent >= PER_RUN) return sent;
      const key = `weekly:${brand.slug}:${week.monday}:${u.id}`;
      const claim = await prisma.summaryRun.createMany({ data: [{ key, brandId: brand.id, userId: u.id, sentAt: now }], skipDuplicates: true });
      if (claim.count === 0) continue; // outra rodada já pegou
      try {
        await sender({ instance: brand.whatsappInstance!, phone: u.phone!, text, notificationId: key, kind: "WEEKLY_SUMMARY", brand: brand.name });
        sent++;
      } catch (error) {
        await prisma.summaryRun.deleteMany({ where: { key } }); // tenta de novo no minuto seguinte
        if (!(error instanceof WhatsAppError)) throw error;
      }
    }
  }
  return sent;
}
