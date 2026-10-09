import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { loadActor } from "@/lib/auth/actor";
import { runJobs } from "@/lib/jobs/queue";
import type { ShopifyClient } from "@/lib/shopify/client";
import { backfillHandlers, IMPORT_BATCH, POLL_EVERY_MS, startHistoricalImport } from "@/lib/shopify/backfill";
import { shopifyOrder, toJsonl } from "../shopify-order-fixture";
import { seedBrand, testClient } from "./fixtures";

const prisma = testClient();
afterAll(() => prisma.$disconnect());
beforeEach(async () => {
  await prisma.job.deleteMany();
});

const SINCE = new Date("2026-07-21T03:00:00Z");

async function setup() {
  const { brand } = await seedBrand(prisma);
  const id = randomUUID();
  await prisma.user.create({ data: { id, email: `${id}@x.com`, name: "SA", roleGrants: { create: { role: "SUPER_ADMIN" } } } });
  return { brand, admin: await loadActor(prisma, id) };
}

/** Shopify falso: a exportação fica RUNNING nas primeiras `runningPolls` consultas, depois termina com `final`. */
function fakeShopify(opts: { runningPolls: number; final?: string; url?: string | null }) {
  const calls: string[] = [];
  let polls = 0;
  const client = {
    shop: "x",
    graphql: async (query: string) => {
      if (query.includes("bulkOperationRunQuery")) {
        calls.push("start");
        return { bulkOperationRunQuery: { bulkOperation: { id: "gid://shopify/BulkOperation/1", status: "CREATED" }, userErrors: [] } };
      }
      calls.push("poll");
      polls++;
      const status = polls <= opts.runningPolls ? "RUNNING" : (opts.final ?? "COMPLETED");
      return { node: { status, errorCode: status === "FAILED" ? "ACCESS_DENIED" : null, url: status === "COMPLETED" ? (opts.url === undefined ? "https://bulk.example/file.jsonl" : opts.url) : null } };
    },
  } as unknown as ShopifyClient;
  return { clientFor: async () => client, calls };
}

/** Roda o worker avançando o relógio até a fila esvaziar. */
async function drain(handlers: ReturnType<typeof backfillHandlers>, start: Date) {
  let t = start.getTime();
  for (let i = 0; i < 50; i++) {
    await runJobs(prisma, handlers, { clock: () => new Date(t) });
    if ((await prisma.job.count({ where: { status: "PENDING" } })) === 0) return;
    t += POLL_EVERY_MS;
  }
  throw new Error("fila não esvaziou");
}

describe("carga histórica (banco real)", () => {
  it("exporta, acompanha e importa em lotes; registra a passada e a auditoria", async () => {
    const { brand, admin } = await setup();
    const orders = Array.from({ length: IMPORT_BATCH + 5 }, (_, i) => shopifyOrder({ id: `gid://shopify/Order/h${i}`, name: `#h${i}` }));
    const jsonl = toJsonl(orders);
    let downloads = 0;
    const fakeFetch = (async () => {
      downloads++;
      return new Response(jsonl);
    }) as unknown as typeof fetch;
    const { clientFor, calls } = fakeShopify({ runningPolls: 2 });
    const t0 = new Date();
    const runId = await startHistoricalImport(prisma, admin, brand.id, SINCE);
    await drain(backfillHandlers(prisma, { clientFor, fetch: fakeFetch, now: () => t0 }), t0);

    expect(calls).toEqual(["start", "poll", "poll", "poll"]);
    expect(downloads).toBe(2); // dois lotes
    const run = await prisma.syncRun.findUniqueOrThrow({ where: { id: runId } });
    expect(run).toMatchObject({ kind: "backfill", ordersSeen: IMPORT_BATCH + 5, ordersFixed: IMPORT_BATCH + 5, error: null });
    expect(run.cursor?.toISOString()).toBe(SINCE.toISOString());
    expect(run.finishedAt).not.toBeNull();
    expect(await prisma.order.count({ where: { brandId: brand.id, name: { startsWith: "#h" } } })).toBe(IMPORT_BATCH + 5);
    expect(await prisma.auditLog.count({ where: { action: "sync.backfill", entityId: runId } })).toBe(1);
  });

  it("exportação que falha no Shopify fecha a passada com o motivo", async () => {
    const { brand, admin } = await setup();
    const { clientFor } = fakeShopify({ runningPolls: 0, final: "FAILED" });
    const runId = await startHistoricalImport(prisma, admin, brand.id, SINCE);
    await drain(backfillHandlers(prisma, { clientFor }), new Date());
    const run = await prisma.syncRun.findUniqueOrThrow({ where: { id: runId } });
    expect(run.error).toBe("Exportação do Shopify terminou como FAILED (ACCESS_DENIED).");
    expect(run.finishedAt).not.toBeNull();
  });

  it("período sem pedidos termina sem baixar nada", async () => {
    const { brand, admin } = await setup();
    const { clientFor } = fakeShopify({ runningPolls: 0, url: null });
    const runId = await startHistoricalImport(prisma, admin, brand.id, SINCE);
    await drain(backfillHandlers(prisma, { clientFor, fetch: (async () => { throw new Error("não devia baixar"); }) as unknown as typeof fetch }), new Date());
    expect(await prisma.syncRun.findUniqueOrThrow({ where: { id: runId } })).toMatchObject({ ordersSeen: 0, error: null });
  });

  it("só super admin; uma carga por vez; carga parada pode ser substituída", async () => {
    const { brand, admin } = await setup();
    const gestaoId = randomUUID();
    await prisma.user.create({ data: { id: gestaoId, email: `${gestaoId}@x.com`, name: "G", roleGrants: { create: { role: "GESTAO", brandId: brand.id } } } });
    await expect(startHistoricalImport(prisma, await loadActor(prisma, gestaoId), brand.id, SINCE)).rejects.toThrow(/Sem permissão/);

    const first = await startHistoricalImport(prisma, admin, brand.id, SINCE);
    await expect(startHistoricalImport(prisma, admin, brand.id, SINCE)).rejects.toThrow(/em andamento/);

    // A tarefa da primeira falha de vez: a carga parou e outra pode começar.
    await prisma.job.updateMany({ where: { brandId: brand.id }, data: { status: "FAILED" } });
    const second = await startHistoricalImport(prisma, admin, brand.id, SINCE);
    expect(second).not.toBe(first);
    expect(await prisma.syncRun.findUniqueOrThrow({ where: { id: first } })).toMatchObject({ error: "Interrompida (tarefa falhou)." });
  });
});
