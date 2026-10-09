import { db } from "@/lib/db";
import { backfillHandlers } from "@/lib/shopify/backfill";
import { ORDER_SYNC_JOB, orderSyncHandler } from "@/lib/shopify/jobs";
import { RECONCILE_JOB, reconcileHandler } from "@/lib/shopify/reconcile";
import type { JobHandlers } from "./queue";

/** Tipos de tarefa conhecidos pelo worker. Cada etapa da E3 registra o seu aqui. */
export function jobHandlers(): JobHandlers {
  const prisma = db();
  return {
    [ORDER_SYNC_JOB]: orderSyncHandler(prisma),
    [RECONCILE_JOB]: reconcileHandler(prisma),
    ...backfillHandlers(prisma),
  };
}
