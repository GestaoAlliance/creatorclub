import type { PrismaClient } from "@/generated/prisma/client";
import { accumulatedSales, dayKey, isUgcOnly, monthKey, noticeEmail, notices, releaseMinFor, type Notice } from "@/domain";
import { creatorBalance, releasedThroughFor, salesByMonth } from "@/lib/commission/release";
import { dayOf } from "@/lib/creators/contract";
import type { EmailSender } from "@/lib/email/sender";
import { FAKE_EMAIL_DOMAIN } from "@/lib/import/legacy";
import { notify } from "./notify";

/**
 * Avisos por data (U5b, D-NOTICES), uma rodada por marca e dia, a partir das 9h de São Paulo (o worker roda a cada
 * minuto; `NoticeRun` garante a rodada única). E o envio por e-mail dos avisos recentes, quando há remetente.
 */

const FIRST_HOUR = 9;
const NEAR_MIN_SHARE = 0.7;
const CONTRACT_WARN_DAYS = 30;
const DAY = 86_400_000;

const hourIn = (now: Date, tz: string) => Number(new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", hourCycle: "h23" }).format(now));

/** Roda os avisos por data das marcas que ainda não rodaram hoje. Devolve quantos avisos novos gravou. */
export async function runDueNotices(prisma: PrismaClient, now = new Date(), only?: { brandId: string }): Promise<number> {
  const brands = await prisma.brand.findMany({
    where: { archivedAt: null, ...(only ? { id: only.brandId } : {}) },
    select: { id: true, timezone: true, withdrawalWindowStartDay: true, withdrawalWindowEndDay: true, releaseMinCents: true, releaseMinPrescriberCents: true },
  });
  let total = 0;
  for (const brand of brands) {
    if (hourIn(now, brand.timezone) < FIRST_HOUR) continue;
    const day = dayKey(now, brand.timezone);
    const run = await prisma.noticeRun.createMany({ data: [{ brandId: brand.id, day }], skipDuplicates: true });
    if (run.count === 0) continue; // já rodou hoje
    const created = await brandNotices(prisma, brand, day, now);
    await prisma.noticeRun.update({ where: { brandId_day: { brandId: brand.id, day } }, data: { created } });
    total += created;
  }
  return total;
}

async function brandNotices(
  prisma: PrismaClient,
  brand: { id: string; timezone: string; withdrawalWindowStartDay: number; withdrawalWindowEndDay: number; releaseMinCents: number; releaseMinPrescriberCents: number },
  day: string,
  now: Date,
): Promise<number> {
  const tz = brand.timezone;
  const month = monthKey(now, tz);
  const dom = Number(day.slice(8, 10));
  const creators = await prisma.creator.findMany({
    where: { brandId: brand.id, status: "ACTIVE" },
    select: { id: true, brandId: true, categories: true, withdrawalsUnlockedAt: true, contractEnd: true, contractTemplate: { select: { releaseMinCents: true } } },
  });
  const partners = creators.filter((c) => !isUgcOnly(c.categories));
  const out: { brandId: string; creatorId: string; notice: Notice }[] = [];
  const push = (creatorId: string, notice: Notice) => out.push({ brandId: brand.id, creatorId, notice });

  // Janela de saque: aberta (a partir do 1º dia) e lembrete nos 3 últimos dias, para quem tem saldo e não pediu.
  const { withdrawalWindowStartDay: start, withdrawalWindowEndDay: end } = brand;
  if (dom >= start && dom <= end) {
    const unlocked = partners.filter((c) => c.withdrawalsUnlockedAt);
    const asked = new Set(
      (
        await prisma.withdrawal.findMany({
          where: { creatorId: { in: unlocked.map((c) => c.id) }, status: { in: ["REQUESTED", "PAID"] }, requestedAt: { gte: new Date(now.getTime() - 40 * DAY) } },
          select: { creatorId: true, requestedAt: true },
        })
      )
        .filter((w) => monthKey(w.requestedAt, tz) === month)
        .map((w) => w.creatorId),
    );
    for (const c of unlocked) {
      if (asked.has(c.id)) continue;
      const b = await creatorBalance(prisma, c, tz, now);
      if (b.availableCents <= 0) continue;
      push(c.id, notices.withdrawalWindow(month, end, b.availableCents, false));
      if (dom >= end - 2) push(c.id, notices.withdrawalWindow(month, end, b.availableCents, true));
    }
  }

  // Perto do mínimo: passou de 70% do mínimo do contrato e ainda não chegou (uma vez por mês).
  const ids = partners.map((c) => c.id);
  const [sales, released] = await Promise.all([salesByMonth(prisma, ids, tz), releasedThroughFor(prisma, ids)]);
  for (const c of partners) {
    const min = releaseMinFor(c.categories, brand, c.contractTemplate);
    if (!min) continue;
    const acc = accumulatedSales(sales.get(c.id)!, released.get(c.id) ?? null, month);
    if (acc >= min * NEAR_MIN_SHARE && acc < min) push(c.id, notices.nearMinimum(month, min - acc));
  }

  // Contrato vencendo: fim nos próximos 30 dias.
  const today = Date.parse(`${day}T00:00:00Z`);
  for (const c of creators) {
    const endDay = dayOf(c.contractEnd);
    if (!endDay) continue;
    const left = (Date.parse(`${endDay}T00:00:00Z`) - today) / DAY;
    if (left > 0 && left <= CONTRACT_WARN_DAYS) push(c.id, notices.contractEnding(endDay));
  }

  return notify(prisma, out);
}

/**
 * E-mail dos avisos (D-NOTICES + D-EMAIL): só com remetente e endereço do site configurados; só avisos das últimas 24 h
 * (ligar o e-mail depois não manda avisos velhos); e-mail de importação (falso) fica de fora. Até 20 por rodada.
 */
export async function emailPendingNotices(prisma: PrismaClient, sender: EmailSender | null, origin: string | null, now = new Date()): Promise<number> {
  if (!sender || !origin) return 0;
  const pending = await prisma.notification.findMany({
    // E-mail de importação (falso) sai da busca: não pode ocupar a fila na frente dos outros.
    where: { emailedAt: null, createdAt: { gte: new Date(now.getTime() - DAY) }, creator: { account: { email: { not: { endsWith: FAKE_EMAIL_DOMAIN } } } } },
    orderBy: { createdAt: "asc" },
    take: 20,
    select: { id: true, title: true, body: true, href: true, brandId: true, brand: { select: { name: true, slug: true } }, creator: { select: { account: { select: { name: true, email: true } } } } },
  });
  let sent = 0;
  for (const n of pending) {
    const { name, email } = n.creator.account;
    try {
      await sender({
        ...noticeEmail({ name, brandName: n.brand.name, title: n.title, body: n.body, link: `${origin}${n.href ?? `/portal/${n.brand.slug}`}` }),
        to: email,
        idempotencyKey: `notice-${n.id}`,
      });
    } catch {
      continue; // tenta de novo na próxima rodada (dentro das 24 h)
    }
    await prisma.notification.update({ where: { id: n.id }, data: { emailedAt: now } });
    sent++;
  }
  return sent;
}

/** Endereço público do site para os links do e-mail (Vercel fornece o de produção). */
export function siteOrigin(env: Record<string, string | undefined> = process.env): string | null {
  const host = env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  return host ? `https://${host.replace(/^https?:\/\//, "")}` : null;
}
