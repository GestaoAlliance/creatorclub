import { redirect } from "next/navigation";
import { brandsWith } from "@/lib/auth/permissions";
import { currentActor } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { syncHealth } from "@/lib/shopify/health";
import { BackfillForm, ConnectForm, SyncNowForm } from "./forms";

export const dynamic = "force-dynamic";

// Tela simples (D-SYNCUI): o visual do design entra quando as telas do portal começarem.
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
    <main className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-10">
      <h1 className="text-2xl font-bold">Saúde do sync</h1>
      {health.length === 0 && <p className="text-sm text-stone-500">Nenhuma marca cadastrada.</p>}
      {health.map((h) => (
        <section key={h.brand.id} className="flex flex-col gap-4 rounded border border-stone-200 p-4">
          <h2 className="text-lg font-semibold">{h.brand.name}</h2>

          <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            <div><div className="text-stone-500">Shopify</div>{h.shopify?.status === "CONNECTED" ? h.shopify.externalId : "não conectado"}</div>
            <div><div className="text-stone-500">Última reconciliação</div>{fmt(h.shopify?.lastSyncAt)}</div>
            <div><div className="text-stone-500">Pedidos no banco</div>{h.orders}</div>
            <div><div className="text-stone-500">Tarefas na fila</div>{h.jobs.pending}</div>
            <div><div className="text-stone-500">Falhas (24 h)</div><span className={h.jobs.failed24h ? "font-semibold text-red-700" : ""}>{h.jobs.failed24h}</span></div>
            <div className="col-span-2 sm:col-span-3"><div className="text-stone-500">Webhooks (24 h)</div>
              {Object.keys(h.webhooks24h).length === 0 ? "nenhum" : Object.entries(h.webhooks24h).map(([s, n]) => `${s}: ${n}`).join(" · ")}
            </div>
          </div>
          {h.shopify?.scopes && <p className="text-xs text-stone-500">Permissões do app: {h.shopify.scopes}</p>}

          {h.shopify?.status === "CONNECTED" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <SyncNowForm brandId={h.brand.id} />
              <BackfillForm brandId={h.brand.id} />
            </div>
          )}

          <div className="flex flex-col gap-1">
            <h3 className="font-semibold">Passadas</h3>
            {h.runs.length === 0 && <p className="text-sm text-stone-500">Nenhuma ainda.</p>}
            {h.runs.map((r) => (
              <div key={r.id} className="text-sm">
                {KIND[r.kind] ?? r.kind} · {fmt(r.startedAt)} · {r.finishedAt ? `${r.ordersSeen} vistos, ${r.ordersFixed} gravados` : "em andamento"}
                {r.error && <span className="text-red-700"> · erro: {r.error}</span>}
              </div>
            ))}
          </div>

          {h.jobs.recentFailures.length > 0 && (
            <div className="flex flex-col gap-1">
              <h3 className="font-semibold">Tarefas que falharam</h3>
              {h.jobs.recentFailures.map((j) => (
                <div key={j.id} className="text-sm text-red-800">{fmt(j.finishedAt)} · {j.type} · {j.attempts} tentativas · {j.lastError}</div>
              ))}
            </div>
          )}

          {h.warnings.length > 0 && (
            <div className="flex flex-col gap-1">
              <h3 className="font-semibold">Avisos de pedidos</h3>
              {h.warnings.map((w) => {
                const a = (w.after ?? {}) as { name?: string; warnings?: string[] };
                return <div key={w.id} className="text-sm">{fmt(w.createdAt)} · {a.name} · {(a.warnings ?? []).join(", ")}</div>;
              })}
            </div>
          )}

          <details>
            <summary className="cursor-pointer text-sm font-semibold">{h.shopify ? "Reconectar loja" : "Conectar loja"}</summary>
            <div className="mt-3"><ConnectForm brandId={h.brand.id} shop={h.shopify?.externalId ?? null} /></div>
          </details>
        </section>
      ))}
    </main>
  );
}
