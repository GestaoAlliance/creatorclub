import Link from "next/link";
import type { CSSProperties } from "react";
import { SalesChart } from "@/components/portal/sales-chart";
import { Card } from "@/components/ui/page";
import { ui } from "@/components/ui/styles";
import { formatBRL } from "@/domain";
import { brandCssVars } from "@/lib/portal/context";
import type { AllianceDashboard } from "@/lib/staff/alliance-dashboard";
import { DASH_PRESETS } from "@/lib/staff/dashboard";
import type { allianceOverview } from "@/lib/staff/overview";
import { AllianceBrandCards } from "./alliance-view";
import { Change, M, Stat } from "./dashboard-view";
import { HideValuesToggle } from "./hide-values";

const dmy = (k: string) => `${k.slice(8, 10)}/${k.slice(5, 7)}`;
const pct = (v: number) => `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
const CAT_LABEL: Record<string, string> = { INFLUENCER: "Influencer", UGC: "UGC", PRESCRITOR: "Prescritor" };

/**
 * "Todas as marcas" (M0.0.4, D-ALLBRANDS): o Início da Alliance com os números das marcas somados, o gráfico, a
 * comparação entre as marcas, as top creators de todas e, embaixo, o que cada marca tem esperando por você.
 */
export function AllianceDashboardView({ d, cards }: { d: AllianceDashboard | null; cards: Awaited<ReturnType<typeof allianceOverview>> }) {
  return (
    <div className="dash flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className={ui.title}>Todas as marcas</h1>
          <p className={ui.muted}>
            {d
              ? `Programa de creators da Alliance · ${dmy(d.period.from)} a ${dmy(d.period.to)} · comparado com ${dmy(d.previous.from)} a ${dmy(d.previous.to)}`
              : "O que cada marca tem esperando por você. Escolha uma marca no topo para entrar no painel dela."}
          </p>
        </div>
        {d && (
          <div className="flex flex-wrap items-center gap-2">
            {DASH_PRESETS.map((p) => (
              <Link key={p.id} href={`/admin?periodo=${p.id}`} className={d.period.preset === p.id ? ui.pillOn : ui.pill}>
                {p.label}
              </Link>
            ))}
            <HideValuesToggle />
          </div>
        )}
      </div>

      {d && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label="Vendas de creators" value={<M>{formatBRL(d.kpis.sales.cents)}</M>} change={d.kpis.sales.change} hint={<>{pct(d.kpis.sales.storeShare)} das lojas · {d.kpis.sales.orders} pedidos</>} />
            <Stat label="Comissão gerada" value={<M>{formatBRL(d.kpis.commission.cents)}</M>} change={d.kpis.commission.change} hint={<>{pct(d.kpis.commission.rate)} das vendas de creators</>} />
            <Stat label="Creators que venderam" value={d.kpis.creators.sold} change={d.kpis.creators.change} hint={<>de {d.kpis.creators.active} ativas</>} />
            <Stat label="Lojas inteiras" value={<M>{formatBRL(d.kpis.store.cents)}</M>} change={d.kpis.store.change} hint={<>{d.kpis.store.paidOrders} pedidos pagos, com e sem cupom</>} />
          </div>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <Card title="Vendas de creators por dia (todas as marcas)">
              <div className="money-chart">
                <SalesChart days={d.days} />
              </div>
              <p className={ui.hint}>Pela data do pagamento, só pagas, como a comissão.</p>
            </Card>
            <Card title="Comparação entre as marcas">
              <ul className="flex flex-col gap-4">
                {d.brands.map((b) => {
                  const max = Math.max(1, ...d.brands.map((x) => x.salesCents));
                  return (
                    <li key={b.id} style={brandCssVars(b) as CSSProperties} className="flex flex-col gap-1.5">
                      <span className="flex items-baseline justify-between gap-3 text-sm">
                        <span className="flex items-center gap-2 font-medium">
                          <span className="size-2.5 rounded-full bg-brand" />
                          {b.name}
                        </span>
                        <span className="tabular-nums font-semibold"><M>{formatBRL(b.salesCents)}</M></span>
                      </span>
                      <span className="h-2 overflow-hidden rounded-full bg-stone-300/40 dark:bg-white/10">
                        <span className="block h-full rounded-full bg-brand" style={{ width: `${(b.salesCents / max) * 100}%` }} />
                      </span>
                      <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-stone-500">
                        <Change v={b.change} />
                        <span>{b.orders} pedidos</span>
                        <span>{pct(b.storeShare)} da loja</span>
                        <span>comissão <M>{formatBRL(b.commissionCents)}</M></span>
                        <span>{b.sold} de {b.active} venderam</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </Card>
          </div>

          <Card title="Top creators de todas as marcas">
            {d.topCreators.length === 0 ? (
              <p className={ui.muted}>Nenhuma venda de creator no período.</p>
            ) : (
              <>
                <p className={ui.hint}>A maior faz {pct(d.concentration.top1)} das vendas de creators · as 3 maiores, {pct(d.concentration.top3)}.</p>
                <ol className="grid gap-x-8 gap-y-3 lg:grid-cols-2">
                  {d.topCreators.map((c, i) => {
                    const max = d.topCreators[0]!.salesCents || 1;
                    return (
                      <li key={`${c.brandSlug}-${c.id}`} style={brandCssVars({ primaryColor: c.brandColor, secondaryColor: null }) as CSSProperties} className="flex flex-col gap-1">
                        <span className="flex items-baseline justify-between gap-3 text-sm">
                          <span className="min-w-0 truncate">
                            <span className="mr-2 tabular-nums text-stone-400">{i + 1}</span>
                            <span className="font-medium">{c.name}</span>
                            <span className="ml-1.5 text-xs text-stone-500">{c.brandName}{c.categories.length ? ` · ${c.categories.map((x) => CAT_LABEL[x]).join(" · ")}` : ""}</span>
                          </span>
                          <span className="shrink-0 tabular-nums"><M>{formatBRL(c.salesCents)}</M> <span className="text-xs text-stone-500">· {c.orders} ped.</span></span>
                        </span>
                        <span className="h-1.5 overflow-hidden rounded-full bg-stone-300/40 dark:bg-white/10">
                          <span className="block h-full rounded-full bg-brand" style={{ width: `${(c.salesCents / max) * 100}%` }} />
                        </span>
                      </li>
                    );
                  })}
                </ol>
              </>
            )}
          </Card>
        </>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Cada marca</h2>
        <AllianceBrandCards brands={cards} />
      </section>
    </div>
  );
}
