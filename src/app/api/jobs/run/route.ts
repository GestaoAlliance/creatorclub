import { closeDueMonths } from "@/lib/commission/release";
import { grantGoalKits } from "@/lib/shipments/goal-kits";
import { grantTierKits } from "@/lib/shipments/tier-kits";
import { db } from "@/lib/db";
import { configuredSender } from "@/lib/email/sender";
import { emailPendingNotices, runDueNotices, siteOrigin } from "@/lib/notifications/scheduled";
import { configuredWhatsApp, whatsappPendingNotices } from "@/lib/notifications/whatsapp";
import { runWeeklySummaries } from "@/lib/notifications/weekly";
import { jobHandlers } from "@/lib/jobs/handlers";
import { runJobs } from "@/lib/jobs/queue";
import { isAuthorizedBearer } from "@/lib/jobs/secret";
import { enqueueDueProductSyncs } from "@/lib/shopify/products";
import { enqueueDueReconciles } from "@/lib/shopify/reconcile";

// Worker da fila: chamado a cada minuto pelo pg_cron do Supabase (D-CRON), com o segredo JOBS_SECRET.
// Também agenda a reconciliação de cada loja a cada 15 min, o catálogo de produtos uma vez por dia, roda o fechamento do mês no dia 1 (D-CONTRACT) e os avisos.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request): Promise<Response> {
  if (!isAuthorizedBearer(request.headers.get("authorization"), process.env.JOBS_SECRET)) {
    return Response.json({ ok: false }, { status: 401 });
  }
  try {
    const prisma = db();
    const scheduled = (await enqueueDueReconciles(prisma)) + (await enqueueDueProductSyncs(prisma));
    const released = await closeDueMonths(prisma);
    // D-GOALKIT: produto liberado assim que a creator bate R$ 1.000 na janela da meta.
    const goalKits = await grantGoalKits(prisma);
    // D-TIERKIT: na Botanika (desde 2026-11), produtos pela tabela mensal, liberados por faixa.
    const tierKits = await grantTierKits(prisma);
    // U5b (D-NOTICES): avisos por data (uma rodada por marca e dia) e e-mail dos avisos recentes, se houver remetente.
    const notices = await runDueNotices(prisma);
    // M2.2 (D-WHATSAPP): com o n8n configurado, a marca com instância da Evolution avisa pelo WhatsApp (sem e-mail).
    const whatsapp = configuredWhatsApp();
    const emailed = await emailPendingNotices(prisma, configuredSender(), siteOrigin(), new Date(), { whatsappOn: whatsapp !== null });
    const whatsapped = await whatsappPendingNotices(prisma, whatsapp, siteOrigin());
    // M3.4 (D-WEEKLY): resumo semanal da gestão, segunda a partir das 9h.
    const weekly = await runWeeklySummaries(prisma, whatsapp, siteOrigin());
    const result = await runJobs(prisma, jobHandlers(), { budgetMs: 35_000 });
    return Response.json({ ok: true, scheduled, released, notices, emailed, whatsapped, weekly, goalKits, tierKits, ...result });
  } catch {
    return Response.json({ ok: false, error: "erro" }, { status: 500 });
  }
}
