import { redirect } from "next/navigation";
import { brandsWith } from "@/lib/auth/permissions";
import { currentActor } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { syncHealth } from "@/lib/shopify/health";
import { Card, Kpi, PageHeader } from "@/components/ui/page";
import { ui } from "@/components/ui/styles";
import { BackfillForm, ConnectForm, SyncNowForm } from "./forms";

export const dynamic = "force-dynamic";

// Saúde do sync com a Shopify, no visual do sistema (D-DESIGNALL).
const fmt = (d: Date | null | undefined) =>
  d ? d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }) : "—";

const KIND: Record<string, string> = { incremental: "Reconciliação", backfill: "Carga histórica", nightly: "Noturna" };

export default async function SyncPage() {
  const actor = await currentActor();
  if (!actor) redirect("/entrar?next=/admin/sync");
  const allowed = brandsWith(actor.grants, "integrations.manage");
  if (allowed !== "ALL" && allowed.length === 0) redirect("/conta");
  const health = await syncHealth(db(), actor);

  return (
    <>
      <PageHeader title="Shopify">Conexão com a loja, reconciliação de pedidos e o que falhou nas últimas 24 horas.</PageHeader>
      {health.length === 0 && <p className={ui.muted}>Nenhuma marca cadastrada.</p>}
      {health.map((h) => (
        <div key={h.brand.id} className="flex flex-col gap-6">
          <Card title={h.brand.name}>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
              <Kpi
                label="Loja"
                value={<span className="text-base">{h.shopify?.externalId ?? "não conectada"}</span>}
                hint={h.shopify?.status === "CONNECTED" ? "conectada" : h.shopify ? "desconectada" : undefined}
              />
              <Kpi label="Última reconciliação" value={<span className="text-base">{fmt(h.shopify?.lastSyncAt)}</span>} />
              <Kpi label="Pedidos no banco" value={h.orders} />
              <Kpi label="Tarefas na fila" value={h.jobs.pending} />
              <Kpi label="Falhas (24 h)" value={h.jobs.failed24h} tone={h.jobs.failed24h ? "red" : undefined} />
              <Kpi
                label="Webhooks (24 h)"
                value={<span className="text-base">{Object.keys(h.webhooks24h).length === 0 ? "nenhum" : Object.entries(h.webhooks24h).map(([s, n]) => `${s}: ${n}`).join(" · ")}</span>}
              />
            </div>
            {h.shopify?.scopes && <p className={ui.hint}>Permissões do app: {h.shopify.scopes}</p>}
            {h.shopify?.status === "CONNECTED" && (
              <div className="grid gap-4 border-t border-stone-200/70 pt-4 sm:grid-cols-2 dark:border-white/10">
                <SyncNowForm brandId={h.brand.id} />
                <BackfillForm brandId={h.brand.id} />
              </div>
            )}
          </Card>

          <Card title="Passadas">
            {h.runs.length === 0 && <p className={ui.muted}>Nenhuma ainda.</p>}
            <ul className={ui.list}>
              {h.runs.map((r) => (
                <li key={r.id} className="py-2.5 text-sm first:pt-0 last:pb-0">
                  <span className="font-medium">{KIND[r.kind] ?? r.kind}</span>
                  <span className="text-stone-500"> · {fmt(r.startedAt)} · {r.finishedAt ? `${r.ordersSeen} vistos, ${r.ordersFixed} gravados` : "em andamento"}</span>
                  {r.error && <span className="text-red-700 dark:text-red-400"> · erro: {r.error}</span>}
                </li>
              ))}
            </ul>
          </Card>

          {h.jobs.recentFailures.length > 0 && (
            <Card title="Tarefas que falharam">
              <ul className={ui.list}>
                {h.jobs.recentFailures.map((j) => (
                  <li key={j.id} className="py-2.5 text-sm text-red-800 first:pt-0 last:pb-0 dark:text-red-300">{fmt(j.finishedAt)} · {j.type} · {j.attempts} tentativas · {j.lastError}</li>
                ))}
              </ul>
            </Card>
          )}

          {h.warnings.length > 0 && (
            <Card title="Avisos de pedidos">
              <ul className={ui.list}>
                {h.warnings.map((w) => {
                  const a = (w.after ?? {}) as { name?: string; warnings?: string[] };
                  return <li key={w.id} className="py-2.5 text-sm first:pt-0 last:pb-0">{fmt(w.createdAt)} · {a.name} · {(a.warnings ?? []).join(", ")}</li>;
                })}
              </ul>
            </Card>
          )}

          <details className={ui.card}>
            <summary className="cursor-pointer font-semibold">{h.shopify ? "Reconectar loja" : "Conectar loja"}</summary>
            <ConnectForm brandId={h.brand.id} shop={h.shopify?.externalId ?? null} />
          </details>
        </div>
      ))}
    </>
  );
}
