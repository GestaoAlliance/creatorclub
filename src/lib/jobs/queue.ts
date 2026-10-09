import { randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";

/**
 * Fila de trabalho no Postgres (D-QUEUE). Quem grava evento + tarefa usa `enqueueJob` dentro da mesma
 * transação; o worker (`runJobs`) pega tarefas com `FOR UPDATE SKIP LOCKED`, segura cada uma por um prazo
 * (`lockedUntil`) e, se falhar, agenda nova tentativa com espera crescente até `maxAttempts`.
 */

type Db = PrismaClient | Prisma.TransactionClient;

export type JobInput = {
  type: string;
  brandId?: string | null;
  payload?: Prisma.InputJsonValue;
  /** Mesma chave = mesma tarefa: a segunda gravação é ignorada. */
  dedupeKey?: string;
  runAt?: Date;
  maxAttempts?: number;
};

export type ClaimedJob = {
  id: string;
  brandId: string | null;
  type: string;
  payload: Prisma.JsonValue;
  attempts: number;
  maxAttempts: number;
};

export type JobHandler = (job: ClaimedJob) => Promise<void>;
export type JobHandlers = Record<string, JobHandler>;

export const LEASE_MS = 5 * 60_000;
const BACKOFF_BASE_MS = 30_000;
const BACKOFF_MAX_MS = 60 * 60_000;

/** Espera antes da próxima tentativa: 30 s, 1 min, 2 min… até 1 h. */
export function backoffMs(attempts: number): number {
  return Math.min(BACKOFF_BASE_MS * 2 ** Math.max(attempts - 1, 0), BACKOFF_MAX_MS);
}

/** Grava uma tarefa. Com `dedupeKey` repetida, não grava de novo e devolve `false`. */
export async function enqueueJob(tx: Db, input: JobInput): Promise<boolean> {
  const { count } = await tx.job.createMany({
    data: [
      {
        type: input.type,
        brandId: input.brandId ?? null,
        payload: input.payload ?? {},
        dedupeKey: input.dedupeKey ?? null,
        runAt: input.runAt ?? new Date(),
        ...(input.maxAttempts ? { maxAttempts: input.maxAttempts } : {}),
      },
    ],
    skipDuplicates: true,
  });
  return count === 1;
}

/**
 * Pega até `limit` tarefas prontas (pendentes com `runAt` vencido, ou presas em RUNNING com prazo vencido),
 * sem esperar por tarefas que outro worker já travou. Cada tarefa pega conta uma tentativa.
 */
export async function claimJobs(prisma: PrismaClient, workerId: string, limit: number, now = new Date()): Promise<ClaimedJob[]> {
  const lockedUntil = new Date(now.getTime() + LEASE_MS);
  return prisma.$queryRaw<ClaimedJob[]>`
    UPDATE "Job" AS j
       SET "status" = 'RUNNING', "lockedBy" = ${workerId}, "lockedUntil" = ${lockedUntil}, "attempts" = j."attempts" + 1
     WHERE j."id" IN (
       SELECT "id" FROM "Job"
        WHERE "attempts" < "maxAttempts"
          AND (("status" = 'PENDING' AND "runAt" <= ${now})
            OR ("status" = 'RUNNING' AND "lockedUntil" < ${now}))
        ORDER BY "runAt", "createdAt"
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED)
    RETURNING j."id", j."brandId", j."type", j."payload", j."attempts", j."maxAttempts"`;
}

/** Tarefas que travaram (prazo vencido) já na última tentativa viram FAILED, para aparecer na tela de saúde. */
export async function failExhaustedJobs(prisma: PrismaClient, now = new Date()): Promise<number> {
  const { count } = await prisma.job.updateMany({
    where: { status: "RUNNING", lockedUntil: { lt: now }, attempts: { gte: prisma.job.fields.maxAttempts } },
    data: { status: "FAILED", lastError: "Prazo esgotado na última tentativa.", lockedBy: null, lockedUntil: null, finishedAt: now },
  });
  return count;
}

// Só quem ainda segura a tarefa pode concluí-la (outro worker pode ter assumido depois do prazo).
const heldBy = (job: ClaimedJob, workerId: string) => ({ id: job.id, status: "RUNNING" as const, lockedBy: workerId });

async function completeJob(prisma: PrismaClient, job: ClaimedJob, workerId: string, now: Date) {
  await prisma.job.updateMany({
    where: heldBy(job, workerId),
    data: { status: "DONE", lockedBy: null, lockedUntil: null, lastError: null, finishedAt: now },
  });
}

async function failJob(prisma: PrismaClient, job: ClaimedJob, workerId: string, error: unknown, now: Date, permanent = false) {
  const message = (error instanceof Error ? error.message : String(error)).slice(0, 2000);
  const final = permanent || job.attempts >= job.maxAttempts;
  await prisma.job.updateMany({
    where: heldBy(job, workerId),
    data: final
      ? { status: "FAILED", lockedBy: null, lockedUntil: null, lastError: message, finishedAt: now }
      : { status: "PENDING", lockedBy: null, lockedUntil: null, lastError: message, runAt: new Date(now.getTime() + backoffMs(job.attempts)) },
  });
}

export type RunResult = { claimed: number; done: number; retried: number; failed: number };

/**
 * Executa tarefas até acabar a fila ou o tempo (`budgetMs`). Tipo sem handler falha de vez.
 * Chamado por `POST /api/jobs/run` (agendado pelo pg_cron, D-CRON).
 */
export async function runJobs(
  prisma: PrismaClient,
  handlers: JobHandlers,
  opts: { workerId?: string; batch?: number; budgetMs?: number; clock?: () => Date } = {},
): Promise<RunResult> {
  const workerId = opts.workerId ?? `worker-${randomUUID()}`;
  const clock = opts.clock ?? (() => new Date());
  const batch = opts.batch ?? 10;
  const deadline = Date.now() + (opts.budgetMs ?? 45_000);
  const result: RunResult = { claimed: 0, done: 0, retried: 0, failed: 0 };

  result.failed += await failExhaustedJobs(prisma, clock());
  while (Date.now() < deadline) {
    const jobs = await claimJobs(prisma, workerId, batch, clock());
    if (jobs.length === 0) break;
    result.claimed += jobs.length;
    for (const job of jobs) {
      const handler = handlers[job.type];
      if (!handler) {
        await failJob(prisma, job, workerId, `Tipo de tarefa desconhecido: ${job.type}`, clock(), true);
        result.failed++;
        continue;
      }
      try {
        await handler(job);
        await completeJob(prisma, job, workerId, clock());
        result.done++;
      } catch (error) {
        await failJob(prisma, job, workerId, error, clock());
        if (job.attempts >= job.maxAttempts) result.failed++;
        else result.retried++;
      }
    }
  }
  return result;
}
