import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { claimJobs, enqueueJob, LEASE_MS, runJobs, type ClaimedJob } from "@/lib/jobs/queue";
import { testClient } from "./fixtures";

const prisma = testClient();
afterAll(() => prisma.$disconnect());
// Só este arquivo grava tarefas; cada teste começa com a fila vazia.
beforeEach(async () => {
  await prisma.job.deleteMany();
});

const T0 = new Date("2026-10-09T12:00:00Z");
const at = (ms: number) => new Date(T0.getTime() + ms);

describe("fila de tarefas", () => {
  it("dedupeKey repetida não grava a tarefa de novo", async () => {
    expect(await enqueueJob(prisma, { type: "x", dedupeKey: "webhook:1", runAt: T0 })).toBe(true);
    expect(await enqueueJob(prisma, { type: "x", dedupeKey: "webhook:1", runAt: T0 })).toBe(false);
    expect(await prisma.job.count()).toBe(1);
  });

  it("enqueue dentro de transação desfeita não deixa tarefa", async () => {
    await expect(
      prisma.$transaction(async (tx) => {
        await enqueueJob(tx, { type: "x", runAt: T0 });
        throw new Error("desfaz");
      }),
    ).rejects.toThrow("desfaz");
    expect(await prisma.job.count()).toBe(0);
  });

  it("dois workers ao mesmo tempo nunca pegam a mesma tarefa", async () => {
    for (let i = 0; i < 20; i++) await enqueueJob(prisma, { type: "x", runAt: T0 });
    const [a, b] = await Promise.all([claimJobs(prisma, "a", 15, at(1)), claimJobs(prisma, "b", 15, at(1))]);
    const ids = [...a, ...b].map((j) => j.id);
    expect(ids.length).toBe(20);
    expect(new Set(ids).size).toBe(20);
  });

  it("não pega tarefa agendada para depois", async () => {
    await enqueueJob(prisma, { type: "x", runAt: at(60_000) });
    expect(await claimJobs(prisma, "a", 10, T0)).toHaveLength(0);
    expect(await claimJobs(prisma, "a", 10, at(60_000))).toHaveLength(1);
  });

  it("sucesso conclui; erro agenda nova tentativa com espera; última tentativa vira FAILED", async () => {
    await enqueueJob(prisma, { type: "ok", runAt: T0 });
    await enqueueJob(prisma, { type: "falha", runAt: T0, maxAttempts: 2, dedupeKey: "f" });
    const seen: ClaimedJob[] = [];
    const handlers = {
      ok: async (job: ClaimedJob) => void seen.push(job),
      falha: async () => {
        throw new Error("Shopify fora do ar");
      },
    };

    const first = await runJobs(prisma, handlers, { clock: () => T0 });
    expect(first).toEqual({ claimed: 2, done: 1, retried: 1, failed: 0 });
    expect(seen).toHaveLength(1);
    let falha = await prisma.job.findUniqueOrThrow({ where: { dedupeKey: "f" } });
    expect(falha).toMatchObject({ status: "PENDING", attempts: 1, lastError: "Shopify fora do ar", lockedBy: null });
    expect(falha.runAt.getTime()).toBe(at(30_000).getTime());

    // Antes da espera, nada a fazer; depois dela, a segunda (e última) tentativa falha de vez.
    expect((await runJobs(prisma, handlers, { clock: () => at(10_000) })).claimed).toBe(0);
    const second = await runJobs(prisma, handlers, { clock: () => at(30_000) });
    expect(second).toEqual({ claimed: 1, done: 0, retried: 0, failed: 1 });
    falha = await prisma.job.findUniqueOrThrow({ where: { dedupeKey: "f" } });
    expect(falha).toMatchObject({ status: "FAILED", attempts: 2 });
    expect(falha.finishedAt).not.toBeNull();
    expect(await prisma.job.count({ where: { status: "DONE" } })).toBe(1);
  });

  it("tipo sem handler falha de vez, sem novas tentativas", async () => {
    await enqueueJob(prisma, { type: "desconhecido", runAt: T0, dedupeKey: "d" });
    expect(await runJobs(prisma, {}, { clock: () => T0 })).toEqual({ claimed: 1, done: 0, retried: 0, failed: 1 });
    expect(await prisma.job.findUniqueOrThrow({ where: { dedupeKey: "d" } })).toMatchObject({
      status: "FAILED",
      attempts: 1,
      lastError: "Tipo de tarefa desconhecido: desconhecido",
    });
  });

  it("tarefa presa (worker caiu) volta depois do prazo; o worker antigo não consegue mais concluí-la", async () => {
    await enqueueJob(prisma, { type: "x", runAt: T0, dedupeKey: "p" });
    const stuck = (await claimJobs(prisma, "caiu", 1, T0))[0]!;
    expect(await claimJobs(prisma, "novo", 1, at(LEASE_MS - 1))).toHaveLength(0);
    const again = (await claimJobs(prisma, "novo", 1, at(LEASE_MS + 1)))[0]!;
    expect(again.id).toBe(stuck.id);
    expect(again.attempts).toBe(2);

    // O worker antigo acorda e tenta concluir: não muda nada, a tarefa é do novo.
    await prisma.job.updateMany({ where: { id: stuck.id, status: "RUNNING", lockedBy: "caiu" }, data: { status: "DONE" } });
    expect(await prisma.job.findUniqueOrThrow({ where: { id: stuck.id } })).toMatchObject({ status: "RUNNING", lockedBy: "novo" });
  });

  it("tarefa presa na última tentativa vira FAILED em vez de rodar de novo", async () => {
    await enqueueJob(prisma, { type: "x", runAt: T0, maxAttempts: 1, dedupeKey: "u" });
    await claimJobs(prisma, "caiu", 1, T0);
    const result = await runJobs(prisma, { x: async () => {} }, { clock: () => at(LEASE_MS + 1) });
    expect(result).toEqual({ claimed: 0, done: 0, retried: 0, failed: 1 });
    expect(await prisma.job.findUniqueOrThrow({ where: { dedupeKey: "u" } })).toMatchObject({
      status: "FAILED",
      lastError: "Prazo esgotado na última tentativa.",
    });
  });
});
