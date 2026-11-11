import { AlertTriangle, ArrowDownRight, ArrowRight, ArrowUpRight, Minus, Sparkles, TrendingDown, TrendingUp } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { SalesChart } from "@/components/portal/sales-chart";
import { needsFor } from "@/lib/staff/needs";
import { Card } from "@/components/ui/page";
import { ui } from "@/components/ui/styles";
import { formatBRL } from "@/domain";
import { DASH_PRESETS, type DashCategory, type StaffDashboard } from "@/lib/staff/dashboard";
import type { StaffHome } from "@/lib/staff/home";
import type { BaseHealth, Cashflow } from "@/lib/staff/insights";
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

/** D-HOMEINSIGHTS: em que ponto do caminho está a base (agora), com o tempo até a primeira venda. */
function HealthCard({ h }: { h: BaseHealth }) {
  const steps = [
    { label: "Candidatas", n: h.applications, href: "/admin/candidatas", hint: "esperando aprovação" },
    { label: "Assinando", n: h.awaitingSignature, href: "/admin/candidatas?ver=WAITING", hint: "aprovadas, sem assinar" },
    { label: "Vendendo", n: h.selling, href: "/admin/creators", hint: "venda nos últimos 30 dias", good: true },
    { label: "Paradas", n: h.stopped, href: "/admin/creators/acoes?tipo=IDLE", hint: "venderam antes, nada em 30 dias", bad: true },
    { label: "Nunca venderam", n: h.neverSold, href: "/admin/creators?semvenda=1", hint: "ativas sem nenhuma venda", bad: true },
  ];
  const sellingShare = h.active ? h.selling / h.active : 0;
  return (
    <Card title="Saúde da base de creators">
      <div className="flex flex-col gap-4">
        <div>
          <div className="flex items-baseline justify-between gap-2 text-sm">
            <span>
              <strong className="text-2xl font-semibold tabular-nums text-brand">{pct(sellingShare)}</strong> das {h.active} ativas venderam nos últimos 30 dias
            </span>
            {h.medianDaysToFirstSale !== null && <span className={ui.hint}>1ª venda em ~{h.medianDaysToFirstSale} dias depois de entrar</span>}
          </div>
          <div className="mt-2 flex h-2.5 overflow-hidden rounded-full bg-stone-300/40 dark:bg-white/10">
            <span className="h-full bg-brand" style={{ width: `${(h.selling / Math.max(1, h.active)) * 100}%` }} />
            <span className="h-full bg-amber-400/80" style={{ width: `${(h.stopped / Math.max(1, h.active)) * 100}%` }} />
            <span className="h-full bg-red-400/70" style={{ width: `${(h.neverSold / Math.max(1, h.active)) * 100}%` }} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {steps.map((x) => (
            <Link key={x.label} href={x.href} className="group rounded-2xl border border-stone-200/80 p-3 transition-colors hover:bg-stone-100/70 dark:border-white/10 dark:hover:bg-white/5">
              <p className="text-xs text-stone-500">{x.label}</p>
              <p className={`text-2xl font-semibold tabular-nums ${x.good ? "text-brand" : x.bad && x.n > 0 ? "text-red-700 dark:text-red-300" : ""}`}>{x.n}</p>
              <p className="text-[11px] leading-tight text-stone-500">{x.hint}</p>
            </Link>
          ))}
        </div>
      </div>
    </Card>
  );
}

/** D-HOMEINSIGHTS: caixa do Pagamento (o que vai sair nas próximas semanas). */
function CashCard({ c }: { c: Cashflow }) {
  const rows = [
    { label: "A liberar no dia 1", v: c.heldCents, hint: "comissão do mês, se bater o mínimo" },
    { label: "Disponível para saque", v: c.availableCents, hint: `${c.availableCreators} creators podem pedir` },
    { label: "Saques pedidos", v: c.requested.cents, hint: `${c.requested.count} para conferir` },
    { label: "Aprovados a pagar", v: c.approved.cents, hint: `${c.approved.count} no prazo de pagamento` },
  ];
  return (
    <Card title="Caixa das comissões">
      <ul className="flex flex-col divide-y divide-stone-200/70 dark:divide-white/10">
        {rows.map((r) => (
          <li key={r.label} className="flex items-baseline justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
            <span className="min-w-0">
              <span className="block text-sm">{r.label}</span>
              <span className={ui.hint}>{r.hint}</span>
            </span>
            <strong className="shrink-0 tabular-nums"><M>{formatBRL(r.v)}</M></strong>
          </li>
        ))}
      </ul>
      {c.lockedCents > 0 && (
        <p className={`${ui.hint} mt-2`}>
          + <M>{formatBRL(c.lockedCents)}</M> liberados de quem ainda espera o saldo de abertura.{" "}
          <Link href="/admin/abertura" className="underline">Aprovar</Link>
        </p>
      )}
    </Card>
  );
}

/** D-HOMEINSIGHTS: quem subiu, quem caiu e quem vendeu pela primeira vez, com o alerta de concentração. */
function MovementsCard({ d, h }: { d: StaffDashboard; h: BaseHealth | null }) {
  const m = d.movements;
  const row = (x: { id: string; name: string; nowCents: number; beforeCents: number; deltaCents: number }, up: boolean) => (
    <li key={x.id}>
      <Link href={`/admin/creators/${x.id}`} className="group flex items-baseline justify-between gap-3 py-1.5 text-sm">
        <span className="min-w-0 truncate group-hover:underline">{x.name}</span>
        <span className={`shrink-0 tabular-nums font-semibold ${up ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"}`}>
          {up ? "+" : "−"}<M>{formatBRL(Math.abs(x.deltaCents))}</M>
        </span>
      </Link>
    </li>
  );
  const col = (title: string, icon: ReactNode, children: ReactNode, empty: string, has: boolean) => (
    <div className="flex flex-col gap-1">
      <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-stone-500">{icon}{title}</p>
      {has ? <ul className="divide-y divide-stone-200/60 dark:divide-white/10">{children}</ul> : <p className={ui.muted}>{empty}</p>}
    </div>
  );
  return (
    <Card title="Movimentos do período">
      <div className="flex flex-col gap-4">
        {d.concentration.alert && (
          <p className="flex items-start gap-2 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <span>
              <strong>Dependência alta:</strong> a maior creator faz {pct(d.concentration.top1)} das vendas de creators (as 3 maiores, {pct(d.concentration.top3)}). Vale ativar mais creators para diluir o risco.
            </span>
          </p>
        )}
        <div className="grid gap-6 md:grid-cols-3">
          {col("Subindo", <TrendingUp className="size-3.5 text-emerald-600" />, m.rising.map((x) => row(x, true)), "Ninguém cresceu contra o período anterior.", m.rising.length > 0)}
          {col("Caindo", <TrendingDown className="size-3.5 text-red-600" />, m.falling.map((x) => row(x, false)), "Ninguém caiu forte.", m.falling.length > 0)}
          {col(
            `Primeira venda${h && h.firstSaleCount > 0 ? ` (${h.firstSaleCount})` : ""}`,
            <Sparkles className="size-3.5 text-brand" />,
            (h?.firstSales ?? []).map((x) => (
              <li key={x.id}>
                <Link href={`/admin/creators/${x.id}`} className="group flex items-baseline justify-between gap-3 py-1.5 text-sm">
                  <span className="min-w-0 truncate group-hover:underline">{x.name}</span>
                  <span className="shrink-0 text-xs text-stone-500">{x.day.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" })}</span>
                </Link>
              </li>
            )),
            "Nenhuma creator nova vendeu no período.",
            (h?.firstSales.length ?? 0) > 0,
          )}
        </div>
      </div>
    </Card>
  );
}

const href = (p: { periodo?: string; tipo?: string }) => {
  const s = new URLSearchParams(Object.entries(p).filter(([, v]) => v) as [string, string][]).toString();
  return `/admin/marca${s ? `?${s}` : ""}`;
};

/** Início com o dashboard (M0.0.4, modelo da referência), para quem vê dinheiro na marca. */
export function DashboardView({
  d,
  h,
  category,
  brandName,
  health = null,
  cash = null,
}: {
  d: StaffDashboard;
  h: StaffHome;
  category: DashCategory;
  brandName: string;
  health?: BaseHealth | null;
  cash?: Cashflow | null;
}) {
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
        <Stat label="Vendas de creators" value={<M>{formatBRL(k.sales.cents)}</M>} change={k.sales.change} hint={<>{k.sales.orders} pedidos · {pct(k.sales.storeShare)} da loja</>} />
        <Stat label="Comissão gerada" value={<M>{formatBRL(k.commission.cents)}</M>} change={k.commission.change} hint={<>{pct(k.commission.rate)} das vendas de creators</>} />
        <Stat label="Creators que venderam" value={k.creators.sold} change={k.creators.change} hint={<>de {k.creators.active} ativas</>} />
        <Stat label="Produtos vendidos" value={k.units.count} change={k.units.change} hint={<>com cupom · ticket <M>{formatBRL(k.units.ticketCents)}</M></>} />
      </div>

      {health && (
        <div className={`grid gap-6 ${cash ? "xl:grid-cols-[1.6fr_1fr]" : ""}`}>
          <HealthCard h={health} />
          {cash && <CashCard c={cash} />}
        </div>
      )}

      {/* Pedido do responsável (2026-10-26): o Início da marca mostra só as vendas de creators (sem a loja inteira). */}
      <Card title="Vendas de creators por dia">
        <div className="money-chart">
          <SalesChart days={d.days} />
        </div>
      </Card>

      <MovementsCard d={d} h={health} />

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
          {d.giftUnits > 0 && <p className={`${ui.hint} mt-3`}>Fora do ranking: {d.giftUnits} brindes enviados junto com os pedidos.</p>}
        </Card>
      </div>
    </div>
  );
}
