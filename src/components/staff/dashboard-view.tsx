import { ArrowDownRight, ArrowRight, ArrowUpRight, Minus } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { SalesChart } from "@/components/portal/sales-chart";
import { needsFor } from "@/lib/staff/needs";
import { Card } from "@/components/ui/page";
import { ui } from "@/components/ui/styles";
import { formatBRL } from "@/domain";
import { DASH_PRESETS, type DashCategory, type StaffDashboard } from "@/lib/staff/dashboard";
import type { StaffHome } from "@/lib/staff/home";
import { HideValuesToggle } from "./hide-values";

const dmy = (k: string) => `${k.slice(8, 10)}/${k.slice(5, 7)}`;
const pct = (v: number) => `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
const CATS: { id: DashCategory; label: string }[] = [
  { id: "", label: "Todos os tipos" },
  { id: "INFLUENCER", label: "Influencer" },
  { id: "UGC", label: "UGC" },
  { id: "PRESCRITOR", label: "Prescritor" },
];
const CAT_LABEL: Record<string, string> = { INFLUENCER: "Influencer", UGC: "UGC", PRESCRITOR: "Prescritor" };

/** Valor em dinheiro que some quando o "olho" está fechado (classe `money`). */
export const M = ({ children }: { children: ReactNode }) => <span className="money">{children}</span>;

export function Change({ v }: { v: number | null }) {
  if (v === null) return <span className="text-xs text-stone-500">sem base anterior</span>;
  const Icon = v > 0 ? ArrowUpRight : v < 0 ? ArrowDownRight : Minus;
  const tone = v > 0 ? "text-emerald-700 dark:text-emerald-400" : v < 0 ? "text-red-700 dark:text-red-400" : "text-stone-500";
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-semibold ${tone}`}>
      <Icon className="size-3.5" />
      {v > 0 ? "+" : ""}
      {v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%
    </span>
  );
}

export function Stat({ label, value, change, hint }: { label: string; value: ReactNode; change: number | null; hint: ReactNode }) {
  return (
    <div className={`${ui.card} gap-2`}>
      <p className="text-xs font-medium uppercase tracking-wide text-stone-500">{label}</p>
      <p className="text-3xl font-semibold tabular-nums">{value}</p>
      <div className="flex flex-wrap items-center gap-2">
        <Change v={change} />
        <span className={ui.hint}>{hint}</span>
      </div>
    </div>
  );
}

/** "Precisa de você" (regra em `needsFor`, D-NEEDSAREA): uma coluna por área, o urgente primeiro e em vermelho. */
function Needs({ h }: { h: StaffHome }) {
  const { readOnly, areas } = needsFor(h);
  const urgent = areas.reduce((n, a) => n + a.items.filter((i) => i.urgent).length, 0);
  return (
    <section className={`${ui.card} gap-4`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-semibold">{readOnly ? "Pendências da equipe" : "Precisa de você"}</p>
        {urgent > 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-800 dark:bg-red-900/40 dark:text-red-200">
            <span className="size-1.5 rounded-full bg-red-600" /> {urgent} {urgent === 1 ? "urgente" : "urgentes"}
          </span>
        )}
      </div>
      {areas.length === 0 ? (
        <p className={ui.muted}>Nada esperando agora.</p>
      ) : (
        <div className={`grid gap-4 ${areas.length > 1 ? "md:grid-cols-2 xl:grid-cols-3" : ""}`}>
          {areas.map((a) => (
            <div key={a.area} className="flex flex-col gap-1.5">
              {areas.length > 1 && <p className="text-xs font-medium uppercase tracking-wide text-stone-500">{a.area}</p>}
              <ul className="flex flex-col gap-1">
                {a.items.map((i) => (
                  <li key={i.label}>
                    <Link
                      href={i.href}
                      className={`group flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors ${i.urgent ? "bg-red-50 hover:bg-red-100 dark:bg-red-950/40 dark:hover:bg-red-950/60" : "hover:bg-stone-100 dark:hover:bg-white/5"}`}
                    >
                      <strong className={`w-8 shrink-0 text-right tabular-nums ${i.urgent ? "text-red-700 dark:text-red-300" : "text-stone-700 dark:text-stone-200"}`}>{i.n}</strong>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{i.label}</span>
                        {i.note && <span className={`block text-xs ${i.urgent ? "text-red-700 dark:text-red-300" : "text-stone-500"}`}>{i.note}</span>}
                      </span>
                      <ArrowRight className="size-3.5 shrink-0 text-stone-400 transition-transform group-hover:translate-x-0.5" />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/** Top creators do período (barra pelo valor; clicar abre a ficha). Usado no Início e em Vendas. */
export function TopCreatorsCard({ d }: { d: StaffDashboard }) {
  const maxCreator = Math.max(1, ...d.topCreators.map((c) => c.salesCents));
  return (
    <Card title="Top creators">
      {d.topCreators.length === 0 ? (
        <p className={ui.muted}>Nenhuma venda de creator no período.</p>
      ) : (
        <>
          <p className={ui.hint}>A maior faz {pct(d.concentration.top1)} das vendas de creators · as 3 maiores, {pct(d.concentration.top3)}.</p>
          <ol className="flex flex-col gap-3">
            {d.topCreators.map((c, i) => (
              <li key={c.id}>
                <Link href={`/admin/creators/${c.id}`} className="group flex flex-col gap-1">
                  <span className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate">
                      <span className="mr-2 tabular-nums text-stone-400">{i + 1}</span>
                      <span className="font-medium group-hover:underline">{c.name}</span>
                      <span className="ml-1.5 text-xs text-stone-500">{c.categories.map((x) => CAT_LABEL[x]).join(" · ")}</span>
                    </span>
                    <span className="shrink-0 tabular-nums">
                      <M>{formatBRL(c.salesCents)}</M> <span className="text-xs text-stone-500">· {c.orders} ped.</span>
                    </span>
                  </span>
                  <span className="h-1.5 overflow-hidden rounded-full bg-stone-300/40 dark:bg-white/10">
                    <span className="block h-full rounded-full bg-brand" style={{ width: `${(c.salesCents / maxCreator) * 100}%` }} />
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </>
      )}
    </Card>
  );
}

const href = (p: { periodo?: string; tipo?: string }) => {
  const s = new URLSearchParams(Object.entries(p).filter(([, v]) => v) as [string, string][]).toString();
  return `/admin/marca${s ? `?${s}` : ""}`;
};

/** Início com o dashboard (M0.0.4, modelo da referência), para quem vê dinheiro na marca. */
export function DashboardView({ d, h, category, brandName }: { d: StaffDashboard; h: StaffHome; category: DashCategory; brandName: string }) {
  const k = d.kpis;
  const maxUnits = Math.max(1, ...d.topProducts.map((p) => p.units));
  return (
    <div className="dash flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className={ui.title}>Início</h1>
          <p className={ui.muted}>
            Programa de creators da {brandName} · {dmy(d.period.from)} a {dmy(d.period.to)} · comparado com {dmy(d.previous.from)} a {dmy(d.previous.to)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {DASH_PRESETS.map((p) => (
            <Link key={p.id} href={href({ periodo: p.id, tipo: category })} className={d.period.preset === p.id ? ui.pillOn : ui.pill}>
              {p.label}
            </Link>
          ))}
          <form action="/admin/marca" className="flex items-center gap-1">
            <select name="tipo" defaultValue={category} className={ui.inputSm} aria-label="Tipo de creator">
              {CATS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
            {d.period.preset && <input type="hidden" name="periodo" value={d.period.preset} />}
            <button className={ui.ghostSm}>Aplicar</button>
          </form>
          <HideValuesToggle />
        </div>
      </div>

      <Needs h={h} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Vendas de creators" value={<M>{formatBRL(k.sales.cents)}</M>} change={k.sales.change} hint={<>{k.sales.orders} pedidos</>} />
        <Stat label="Comissão gerada" value={<M>{formatBRL(k.commission.cents)}</M>} change={k.commission.change} hint={<>{pct(k.commission.rate)} das vendas de creators</>} />
        <Stat label="Creators que venderam" value={k.creators.sold} change={k.creators.change} hint={<>de {k.creators.active} ativas</>} />
        <Stat label="Produtos vendidos" value={k.units.count} change={k.units.change} hint={<>com cupom · ticket <M>{formatBRL(k.units.ticketCents)}</M></>} />
      </div>

      {/* Pedido do responsável (2026-10-26): o Início da marca mostra só as vendas de creators (sem a loja inteira). */}
      <Card title="Vendas de creators por dia">
        <div className="money-chart">
          <SalesChart days={d.days} />
        </div>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <TopCreatorsCard d={d} />
        <Card title="Top produtos com cupom de creator">
          {d.topProducts.length === 0 ? (
            <p className={ui.muted}>Nenhum produto vendido com cupom de creator no período.</p>
          ) : (
            <ol className="flex flex-col gap-3">
              {d.topProducts.map((p, i) => (
                <li key={p.title} className="flex flex-col gap-1">
                  <span className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate">
                      <span className="mr-2 tabular-nums text-stone-400">{i + 1}</span>
                      <span className="font-medium">{p.title}</span>
                    </span>
                    <span className="shrink-0 tabular-nums">
                      {p.units} un. <span className="text-xs text-stone-500">· <M>{formatBRL(p.salesCents)}</M></span>
                    </span>
                  </span>
                  <span className="h-1.5 overflow-hidden rounded-full bg-stone-300/40 dark:bg-white/10">
                    <span className="block h-full rounded-full bg-brand" style={{ width: `${(p.units / maxUnits) * 100}%` }} />
                  </span>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>
    </div>
  );
}
