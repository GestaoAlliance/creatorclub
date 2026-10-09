import { db } from "@/lib/db";
import { jobHandlers } from "@/lib/jobs/handlers";
import { runJobs } from "@/lib/jobs/queue";
import { isAuthorizedBearer } from "@/lib/jobs/secret";
import { enqueueDueReconciles } from "@/lib/shopify/reconcile";

// Worker da fila: chamado a cada minuto pelo pg_cron do Supabase (D-CRON), com o segredo JOBS_SECRET.
// Também agenda a reconciliação de cada loja a cada 15 min.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request): Promise<Response> {
  if (!isAuthorizedBearer(request.headers.get("authorization"), process.env.JOBS_SECRET)) {
    return Response.json({ ok: false }, { status: 401 });
  }
  try {
    const prisma = db();
    const scheduled = await enqueueDueReconciles(prisma);
    const result = await runJobs(prisma, jobHandlers(), { budgetMs: 45_000 });
    return Response.json({ ok: true, scheduled, ...result });
  } catch {
    return Response.json({ ok: false, error: "erro" }, { status: 500 });
  }
}
