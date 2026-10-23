import { redirect } from "next/navigation";
import { brandsWith } from "@/lib/auth/permissions";
import { currentActor } from "@/lib/auth/current";
import { scopedActor, staffContext } from "@/lib/staff/context";
import { db } from "@/lib/db";
import { syncHealth } from "@/lib/shopify/health";
import { sheetSyncStatus } from "@/lib/sheets/central";
import { SHEET_COVERAGE, SHEET_LABEL, SHEETS } from "@/lib/sheets/switch";
import { sheetSwitchAction } from "./actions";
import { missingRecommendedScopes, SCOPE_PURPOSE } from "@/lib/shopify/connect";
import { Card, Kpi, PageHeader } from "@/components/ui/page";
import { badge, ui } from "@/components/ui/styles";
import { AutentiqueForm, BackfillForm, ConnectForm, ProductSyncForm, SyncNowForm } from "./forms";

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
  // A1 (D-ALLIANCE): só a loja da marca escolhida.
  const health = await syncHealth(db(), scopedActor(actor, (await staffContext(actor)).brand?.id));
  const sheets = new Map(await Promise.all(health.map(async (h) => [h.brand.id, await sheetSyncStatus(db(), h.brand.id)] as const)));
  const superAdmin = brandsWith(actor.grants, "staff.manage") === "ALL";
  const autentique = new Map(
    (await db().brandIntegration.findMany({ where: { kind: "AUTENTIQUE", brandId: { in: health.map((h) => h.brand.id) } }, select: { brandId: true, status: true, externalId: true, scopes: true } })).map((r) => [r.brandId, r]),
  );

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
            {h.shopify?.status === "CONNECTED" && missingRecommendedScopes(h.shopify.scopes).length > 0 && (
              <div className="rounded-2xl border border-amber-400/60 bg-amber-100/70 p-3 text-sm text-amber-950 dark:bg-amber-900/30 dark:text-amber-100">
                <p className="font-medium">Faltam permissões no app da Shopify:</p>
                <ul className="mt-1 list-disc pl-5">
                  {missingRecommendedScopes(h.shopify.scopes).map((s) => (
                    <li key={s}><code>{s}</code>: {SCOPE_PURPOSE[s]}</li>
                  ))}
                </ul>
                <p className="mt-1">Libere no app (Dev Dashboard → versão nova) e conecte de novo aqui.</p>
              </div>
            )}
            {h.shopify?.status === "CONNECTED" && (
              <div className="grid gap-4 border-t border-stone-200/70 pt-4 sm:grid-cols-2 dark:border-white/10">
                <div className="flex flex-col gap-4">
                  <SyncNowForm brandId={h.brand.id} />
                  <ProductSyncForm brandId={h.brand.id} count={h.products} />
                </div>
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

          <Card title="Autentique (contratos)">
            {(() => {
              const a = autentique.get(h.brand.id);
              const on = a?.status === "CONNECTED";
              return (
                <>
                  <p className="text-sm">
                    {on ? <>Conectado à conta <strong>{a?.externalId}</strong>{a?.scopes === "sandbox" ? " · modo teste" : ""}.</> : "Não conectado: a aprovação segue com a assinatura no portal."}
                  </p>
                  <AutentiqueForm brandId={h.brand.id} connected={on} sandbox={a?.scopes === "sandbox"} />
                </>
              );
            })()}
          </Card>

          <Card title="Planilhas (só leitura)">
            {(() => {
              const st = sheets.get(h.brand.id)!;
              const LABEL: Record<string, string> = SHEET_LABEL;
              return (
                <>
                  <p className="text-sm">
                    O sistema lê as planilhas a cada 15 minutos e não escreve nada nelas (script{" "}
                    {h.brand.slug === "vermefree" ? "docs/sheets/leitura-vermefree.gs" : "docs/sheets/leitura.gs"}, na conta da marca). Quando a equipe
                    parar de usar uma planilha, confira o checklist e desligue a leitura (M4.7).
                  </p>
                  <ul className={ui.list}>
                    {SHEETS.map((sheet) => {
                      const x = st.syncs.find((y) => y.sheet === sheet);
                      const off = x?.disabledAt ?? null;
                      return (
                        <li key={sheet} className="flex flex-col gap-2 py-3 text-sm">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span>
                              <strong>{SHEET_LABEL[sheet]}</strong> ·{" "}
                              {off ? <span className={badge.neutral}>desligada em {fmt(off)}</span> : x?.lastPushAt ? <>última leitura {fmt(x.lastPushAt)}</> : <span className="text-stone-500">ainda não lida</span>}
                            </span>
                            {superAdmin && (
                              <form action={sheetSwitchAction}>
                                <input type="hidden" name="brandId" value={h.brand.id} />
                                <input type="hidden" name="sheet" value={sheet} />
                                <input type="hidden" name="on" value={off ? "1" : "0"} />
                                <button className={off ? ui.ghostSm : ui.dangerSm}>{off ? "Religar leitura" : "Desligar leitura"}</button>
                              </form>
                            )}
                          </div>
                          <details>
                            <summary className="cursor-pointer text-xs text-stone-500">O que ela faz e onde fica no sistema</summary>
                            <ul className="mt-2 flex flex-col gap-1 text-xs">
                              {SHEET_COVERAGE[sheet].map((c) => (
                                <li key={c.task} className="flex flex-wrap gap-x-2"><span>✓ {c.task}</span><span className="text-stone-500">→ {c.where}</span></li>
                              ))}
                            </ul>
                          </details>
                        </li>
                      );
                    })}
                  </ul>
                  {st.issues.length > 0 && (
                    <>
                      <p className={ui.hint}>Avisos dos últimos 30 dias (o que não foi aplicado; resolva no sistema ou na planilha):</p>
                      <ul className={ui.list}>
                        {st.issues.map((i) => (
                          <li key={i.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2 text-sm">
                            <span>{i.message}</span>
                            <span className={ui.hint}>{LABEL[i.sheet] ?? i.sheet} · {i.tab}, linha {i.row} · {fmt(i.seenAt)}</span>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </>
              );
            })()}
          </Card>

          <details className={ui.card}>
            <summary className="cursor-pointer font-semibold">{h.shopify ? "Reconectar loja" : "Conectar loja"}</summary>
            <ConnectForm brandId={h.brand.id} shop={h.shopify?.externalId ?? null} />
          </details>
        </div>
      ))}
    </>
  );
}
