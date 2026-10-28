import type { PrismaClient } from "@/generated/prisma/client";
import { dayKey, usableHandle } from "@/domain";
import { enqueueJob, type JobHandler } from "@/lib/jobs/queue";
import { brandTags, discoverProfile, realFetcher, type Fetcher } from "./graph";

/**
 * Leitura diária do Instagram (D-INSTAGRAM): a partir das 4h (horário de Brasília), uma tarefa por pessoa com
 * creator ativa e @ cadastrado (seguidores e últimos posts) e uma por marca com Instagram ligado (posts que marcam a
 * marca). Sem token na Vercel, nada é agendado.
 */

export const INSTAGRAM_PROFILE_JOB = "instagram.profile";
export const INSTAGRAM_TAGS_JOB = "instagram.tags";
const START_HOUR = 4;
const SPACING_MS = 30_000;
const TZ = "America/Sao_Paulo";
const hourIn = (now: Date) => Number(new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", hourCycle: "h23" }).format(now));

type Env = Record<string, string | undefined>;
export const metaToken = (env: Env = process.env) => env.META_SYSTEM_TOKEN?.trim() || null;

export async function enqueueDueInstagram(prisma: PrismaClient, now = new Date(), env: Env = process.env): Promise<number> {
  if (!metaToken(env) || hourIn(now) < START_HOUR) return 0;
  const day = dayKey(now, TZ);
  const brands = await prisma.brand.findMany({ where: { instagramUserId: { not: null } }, select: { id: true } });
  if (!brands.length) return 0;
  let created = 0;
  for (const b of brands) {
    if (await enqueueJob(prisma, { type: INSTAGRAM_TAGS_JOB, brandId: b.id, dedupeKey: `ig:tags:${b.id}:${day}`, runAt: now, maxAttempts: 4 })) created++;
  }
  const accounts = await prisma.creatorAccount.findMany({
    where: { instagram: { not: null }, creators: { some: { status: "ACTIVE", archivedAt: null } } },
    select: { id: true, instagram: true },
  });
  // Uma leitura a cada 30 s (no máximo ~120 por hora), para ficar longe do limite da Meta.
  let i = 0;
  for (const a of accounts) {
    if (!usableHandle(a.instagram)) continue;
    const runAt = new Date(now.getTime() + i++ * SPACING_MS);
    if (await enqueueJob(prisma, { type: INSTAGRAM_PROFILE_JOB, payload: { accountId: a.id }, dedupeKey: `ig:profile:${a.id}:${day}`, runAt, maxAttempts: 4 })) created++;
  }
  return created;
}

/** Conta da marca usada para ler a pessoa: a de uma marca dela com Instagram ligado; senão, qualquer uma ligada. */
async function viaBrandIg(prisma: PrismaClient, accountId: string): Promise<string | null> {
  const own = await prisma.creator.findFirst({ where: { accountId, brand: { instagramUserId: { not: null } } }, select: { brand: { select: { instagramUserId: true } } } });
  if (own?.brand.instagramUserId) return own.brand.instagramUserId;
  return (await prisma.brand.findFirst({ where: { instagramUserId: { not: null } }, orderBy: { slug: "asc" }, select: { instagramUserId: true } }))?.instagramUserId ?? null;
}

export async function readProfile(prisma: PrismaClient, accountId: string, fetcher: Fetcher, token: string, now = new Date()): Promise<"OK" | "UNREADABLE" | "SKIPPED"> {
  const account = await prisma.creatorAccount.findUnique({ where: { id: accountId }, select: { instagram: true } });
  const handle = usableHandle(account?.instagram)?.toLowerCase();
  const brandIg = await viaBrandIg(prisma, accountId);
  if (!handle || !brandIg) return "SKIPPED";
  const day = new Date(`${dayKey(now, TZ)}T00:00:00Z`);
  if (await prisma.instagramSnapshot.findUnique({ where: { accountId_day: { accountId, day } }, select: { id: true } })) return "SKIPPED";
  const d = await discoverProfile(fetcher, token, brandIg, handle);
  if (d.status === "UNREADABLE") {
    await prisma.instagramSnapshot.create({ data: { accountId, day, handle, status: "UNREADABLE" } });
    return "UNREADABLE";
  }
  await prisma.$transaction(async (tx) => {
    await tx.instagramSnapshot.create({ data: { accountId, day, handle, status: "OK", followers: d.followers, mediaCount: d.mediaCount } });
    for (const p of d.posts) {
      const data = { postedAt: p.postedAt, mediaType: p.mediaType, productType: p.productType, likes: p.likes, comments: p.comments, caption: p.caption, permalink: p.permalink };
      await tx.instagramPost.upsert({ where: { id: p.id }, create: { id: p.id, accountId, ...data }, update: data });
    }
  });
  return "OK";
}

export async function readBrandTags(prisma: PrismaClient, brandId: string, fetcher: Fetcher, token: string): Promise<number> {
  const brand = await prisma.brand.findUnique({ where: { id: brandId }, select: { instagramUserId: true } });
  if (!brand?.instagramUserId) return 0;
  const tags = await brandTags(fetcher, token, brand.instagramUserId);
  for (const t of tags) {
    const data = { username: t.username, postedAt: t.postedAt, permalink: t.permalink, likes: t.likes, comments: t.comments };
    await prisma.instagramTag.upsert({ where: { brandId_mediaId: { brandId, mediaId: t.id } }, create: { brandId, mediaId: t.id, ...data }, update: data });
  }
  return tags.length;
}

export function instagramHandlers(prisma: PrismaClient, fetcher: Fetcher = realFetcher, env: Env = process.env): Record<string, JobHandler> {
  const token = () => {
    const t = metaToken(env);
    if (!t) throw new Error("META_SYSTEM_TOKEN ausente.");
    return t;
  };
  return {
    [INSTAGRAM_PROFILE_JOB]: async (job) => {
      const accountId = (job.payload as { accountId?: string } | null)?.accountId;
      if (!accountId) throw new Error("Tarefa sem pessoa.");
      await readProfile(prisma, accountId, fetcher, token());
    },
    [INSTAGRAM_TAGS_JOB]: async (job) => {
      if (!job.brandId) throw new Error("Tarefa sem marca.");
      await readBrandTags(prisma, job.brandId, fetcher, token());
    },
  };
}
