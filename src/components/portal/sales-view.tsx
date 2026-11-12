import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, CalendarClock, Package, ShoppingBag, UserPlus } from "lucide-react";
import { ProductThumb } from "@/components/ui/product-thumb";
import { formatBRL, shortBRL } from "@/domain";
import type { portalSalesExtras } from "@/lib/portal/sales-extras";
import { PERIOD_PRESETS } from "@/lib/portal/period";
import { SALE_STATUS_LABEL, type Sale, type SalesPage, type SaleStatus } from "@/lib/portal/sales";
import { SalesChart } from "./sales-chart";
import { HelpTip } from "@/components/ui/tour";
import { releaseWhat } from "@/components/ui/release-progress";

const day = (d: Date) => d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" });
const pct = (bps: number | null) => (bps === null ? "—" : `${(bps / 100).toString().replace(".", ",")}%`);

const STATUS_STYLE: Record<SaleStatus, string> = {
  HELD: "bg-amber-500/15 text-amber-800 dark:text-amber-300",
  RELEASED: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300",
  PARTIAL_REFUND: "bg-orange-500/15 text-orange-800 dark:text-orange-300",
  REVERSED: "bg-red-500/15 text-red-700 dark:text-red-300",
  PENDING_RATE: "bg-stone-500/15 text-stone-700 dark:text-stone-300",
};

function Badge({ status, noCommission = false }: { status: SaleStatus; noCommission?: boolean }) {
  // UGC (D-UGCPORTAL): sem comissão, a situação é só "Paga" ou o estorno.
  if (noCommission && status !== "REVERSED" && status !== "PARTIAL_REFUND")
    return <span className="inline-flex whitespace-nowrap rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-medium text-emerald-800 dark:text-emerald-300">Paga</span>;
  return (
    <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLE[status]}`}>
      {SALE_STATUS_LABEL[status]}
    </span>
  );
}

type Extras = Awaited<ReturnType<typeof portalSalesExtras>>;
const M = ({ children }: { children: React.ReactNode }) => <span className="money">{children}</span>;
const WEEK = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

function dayLabel(key: string, today: string) {
  const diff = Math.round((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${key}T12:00:00Z`)) / 86_400_000);
  if (diff === 0) return "Hoje";
  if (diff === 1) return "Ontem";
  const w = new Date(`${key}T12:00:00Z`).getUTCDay();
  return `${WEEK[w]![0]!.toUpperCase()}${WEEK[w]!.slice(1)}, ${key.slice(8, 10)}/${key.slice(5, 7)}`;
}

/** Vendas do portal (E7.3, D-SALESVIEW; D-PORTALSALES): faixa com período, números e comparação; gráfico com o período
 * anterior e os dias de post; lista por dia com o detalhe do pedido (produtos, sem dado do cliente); produtos que mais
 * vende, melhor dia e horário e clientes novas. `noCommission`: UGC, sem taxa e comissão (D-UGCPORTAL). */
export function SalesView({ page, base, noCommission = false, extras, today }: { page: SalesPage; base: string; noCommission?: boolean; extras: Extras; today: string }) {
  const { totals } = page;
  // D-PORTALSALES: a faixa mostra a comissão (o total de vendas não aparece; cada pedido segue com venda × %). UGC, sem
  // comissão, continua vendo as vendas.
  const prevSeries = noCommission ? extras.previous : extras.previousCommission;
  const prevTotal = prevSeries.reduce((a, b) => a + b, 0);
  const mainCents = noCommission ? totals.baseCents : totals.commissionCents;
  const delta = prevTotal > 0 ? Math.round(((mainCents - prevTotal) / prevTotal) * 100) : null;
  const kpis: { k: string; label: string; v: React.ReactNode }[] = noCommission
    ? [
        { k: "pedidos", label: "Pedidos", v: String(totals.count) },
        { k: "ticket", label: "Ticket médio", v: <M>{shortBRL(totals.ticketCents)}</M> },
      ]
    : [
        { k: "pedidos", label: "Pedidos", v: String(totals.count) },
        { k: "porpedido", label: "Comissão por pedido", v: <M>{totals.count ? formatBRL(Math.round(totals.commissionCents / totals.count)) : "—"}</M> },
      ];
  const groups = new Map<string, Sale[]>();
  for (const sale of page.sales) {
    const k = sale.paidAt.toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
    groups.set(k, [...(groups.get(k) ?? []), sale]);
  }
  const c = extras.customers;
  const known = c.new + c.returning;
  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <section data-tour="vendas-resumo" className="@container relative isolate overflow-hidden rounded-[32px] text-white shadow-[0_30px_60px_-34px_var(--brand)]">
        <div aria-hidden className="brand-art absolute inset-0 -z-10" />
        <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(80%_60%_at_50%_-20%,rgb(255_255_255/0.22),transparent_70%)]" />
        <div className="flex flex-col gap-4 p-5 md:p-7">
          <PeriodPicker page={page} base={base} />
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-white/75">{noCommission ? "Suas vendas" : "Sua comissão"}</p>
              <p className="text-3xl font-semibold tabular-nums md:text-4xl"><M>{formatBRL(mainCents)}</M></p>
            </div>
            {delta !== null && (
              <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ${delta >= 0 ? "bg-emerald-400/25" : "bg-red-400/25"}`}>
                {delta >= 0 ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}{delta >= 0 ? "+" : ""}{delta}% vs. período anterior
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {kpis.map((t) => (
              <div key={t.k} className="frost-tile flex min-w-0 flex-col rounded-2xl px-3 py-2.5 text-stone-900 dark:text-white">
                <span className="truncate text-[10px] font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-300">{t.label}</span>
                <span className="truncate text-lg font-semibold tabular-nums">{t.v}</span>
              </div>
            ))}
          </div>
        </div>
        <HelpTip id="vendas-resumo" className="absolute right-4 top-4" />
      </section>

      {page.days.length > 1 && (
        <section data-tour="vendas-grafico" className="glass relative rounded-3xl p-4 md:p-5">
          <HelpTip id="vendas-grafico" className="absolute right-2 top-2 z-10" />
          <SalesChart days={page.days} noCommission={noCommission} metric={noCommission ? "sales" : "commission"} previous={prevSeries} bands={extras.postDays.map((d) => ({ id: d, name: "Post", startDay: d, endDay: d }))} />
          <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-stone-500">
            <span><span className="mr-1 inline-block h-0.5 w-4 border-t-2 border-dashed border-stone-400 align-middle" />período anterior</span>
            {extras.postDays.length > 0 && <span><span className="mr-1 inline-block size-2.5 rounded-sm bg-brand/25 align-middle" />dia em que você postou</span>}
          </p>
        </section>
      )}

      {(extras.top.length > 0 || extras.best || known > 0) && (
        <div className="@container">
          <div className="grid gap-3 @3xl:grid-cols-3">
            {extras.top.length > 0 && (
              <section className="glass flex flex-col gap-2 rounded-3xl p-4">
                <h2 className="flex items-center gap-2 text-sm font-semibold"><Package className="size-4" />Produtos que mais vende</h2>
                <ul className="flex flex-col gap-1.5">
                  {extras.top.map((p, i) => (
                    <li key={p.title} className="flex items-center gap-2 text-sm">
                      <span className="w-4 text-xs font-semibold text-stone-400">{i + 1}</span>
                      <ProductThumb src={p.image} title={p.title} size="sm" />
                      <span className="min-w-0 flex-1 truncate">{p.title}</span>
                      <span className="shrink-0 font-semibold tabular-nums">{p.units}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {extras.best && (
              <section className="glass flex flex-col gap-1 rounded-3xl p-4">
                <h2 className="flex items-center gap-2 text-sm font-semibold"><CalendarClock className="size-4" />Melhor dia e horário</h2>
                <p className="text-lg font-semibold capitalize">{extras.best.weekday}</p>
                <p className="text-sm text-stone-600 dark:text-stone-300">{extras.best.hours}</p>
                <p className="mt-auto text-xs text-stone-500">É quando mais saem as suas vendas: bom momento para postar e lembrar do cupom.</p>
              </section>
            )}
            {known > 0 && (
              <section className="glass flex flex-col gap-1 rounded-3xl p-4">
                <h2 className="flex items-center gap-2 text-sm font-semibold"><UserPlus className="size-4" />Clientes novas</h2>
                <p className="text-lg font-semibold tabular-nums">{c.new} de {known}</p>
                <span className="h-2 overflow-hidden rounded-full bg-stone-300/60 dark:bg-white/10"><span className="block h-full rounded-full bg-emerald-500" style={{ width: `${Math.round((c.new / known) * 100)}%` }} /></span>
                <p className="mt-auto text-xs text-stone-500">compraram na loja pela primeira vez com o seu cupom{c.unknown ? ` (${c.unknown} sem esse dado)` : ""}.</p>
              </section>
            )}
          </div>
        </div>
      )}

      <section data-tour="vendas-lista" className="flex flex-col gap-3">
        {page.sales.length === 0 ? (
          <p className="glass rounded-3xl py-10 text-center text-sm text-stone-500">Nenhuma venda paga com seu cupom neste período.</p>
        ) : (
          <DayGroups groups={[...groups]} render={([dk, list]) => (
            <div key={dk} className="glass overflow-hidden rounded-3xl">
              <div className="flex items-baseline justify-between gap-2 px-4 pb-1 pt-3">
                <h3 className="text-sm font-semibold">{dayLabel(dk, today)}</h3>
                <span className="text-xs text-stone-500">{list.length} {list.length === 1 ? "pedido" : "pedidos"} · <M>{formatBRL(list.reduce((a, x) => a + (noCommission ? x.baseCents : x.commissionCents), 0))}</M>{noCommission ? "" : " de comissão"}</span>
              </div>
              <ul className="divide-y divide-stone-200/70 dark:divide-white/10">
                {list.map((x) => {
                  const its = extras.items[x.orderId] ?? [];
                  return (
                    <li key={x.orderId}>
                      <details className="group">
                        <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3">
                          <span className="flex -space-x-2">
                            {its.slice(0, 2).map((it) => <span key={it.title} className="rounded-xl ring-2 ring-white dark:ring-stone-900"><ProductThumb src={it.image} title={it.title} size="sm" /></span>)}
                            {its.length === 0 && <span className="grid size-8 place-content-center rounded-xl bg-stone-200 dark:bg-stone-700"><ShoppingBag className="size-4 text-stone-500" /></span>}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">Pedido {x.orderName}</span>
                            <span className="block text-xs text-stone-500">{x.paidAt.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" })} · <M>{formatBRL(x.baseCents)}</M>{!noCommission && ` × ${pct(x.rateBps)}`}</span>
                          </span>
                          <span className="flex shrink-0 flex-col items-end gap-1">
                            <span className={`text-sm font-semibold tabular-nums ${x.commissionCents < 0 ? "text-red-700 dark:text-red-400" : ""}`}><M>{formatBRL(noCommission ? x.baseCents : x.commissionCents)}</M></span>
                            <Badge status={x.status} noCommission={noCommission} />
                          </span>
                        </summary>
                        <div className="flex flex-col gap-1.5 px-4 pb-3">
                          {its.length === 0 ? <p className="text-xs text-stone-500">Sem os produtos deste pedido.</p> : its.map((it) => (
                            <span key={it.title} className="flex items-center gap-2 text-sm"><ProductThumb src={it.image} title={it.title} size="sm" /><span className="min-w-0 flex-1 truncate">{it.title}</span><span className="tabular-nums text-stone-500">{it.quantity}×</span></span>
                          ))}
                          <p className="text-[11px] text-stone-500">Pago em {day(x.paidAt)}. {noCommission ? "" : `Comissão de ${pct(x.rateBps)} sobre os produtos com desconto, sem frete.`}</p>
                        </div>
                      </details>
                    </li>
                  );
                })}
              </ul>
            </div>
          )} />
        )}
      </section>
      <p className="px-1 text-xs text-stone-500">
        {noCommission ? "Valor" : "Base"} = valor dos produtos com desconto, sem frete. A venda conta no dia em que o pedido foi pago.
        {!noCommission && page.release.minCents !== null &&
          ` A comissão é liberada no dia 1 do mês seguinte quando a ${releaseWhat(page.release)} chega a ${formatBRL(page.release.minCents)}.`}
      </p>
    </div>
  );
}

/** Os 5 dias mais recentes abertos; os outros num "Ver os outros dias" (a lista do mês fica longa no celular). */
function DayGroups({ groups, render }: { groups: [string, Sale[]][]; render: (g: [string, Sale[]]) => React.ReactNode }) {
  const SHOW = 5;
  return (
    <>
      {groups.slice(0, SHOW).map((g) => <div key={g[0]}>{render(g)}</div>)}
      {groups.length > SHOW && (
        <details className="group flex flex-col gap-3">
          <summary className="glass cursor-pointer list-none rounded-full px-4 py-2.5 text-center text-sm font-medium group-open:hidden">Ver os outros {groups.length - SHOW} dias</summary>
          <div className="flex flex-col gap-3">{groups.slice(SHOW).map((g) => <div key={g[0]}>{render(g)}</div>)}</div>
        </details>
      )}
    </>
  );
}

const fullDay = (key: string) => `${key.slice(8, 10)}/${key.slice(5, 7)}/${key.slice(0, 4)}`;

/** Hoje · Ontem · 7 dias · Este mês · Personalizado (D-PERIOD). Uma linha, acima de tudo o que ela filtra. */
function PeriodPicker({ page, base }: { page: SalesPage; base: string }) {
  const { period } = page;
  const pill = (on: boolean) => `shrink-0 rounded-full px-3.5 py-1.5 text-sm ${on ? "bg-white font-semibold text-stone-900" : "bg-white/15 text-white hover:bg-white/25"}`;
  return (
    <div className="flex flex-col gap-2">
      <nav aria-label="Período" data-tour="periodo" className="-mx-1 flex items-center gap-1.5 overflow-x-auto px-1 pb-1">
        {PERIOD_PRESETS.map((p) => (
          <Link key={p.key} href={`${base}/vendas?p=${p.key}`} className={pill(period.preset === p.key)} aria-current={period.preset === p.key ? "page" : undefined}>
            {p.label}
          </Link>
        ))}
        <Link href={`${base}/vendas?p=custom&de=${period.firstDay}&ate=${period.lastDay}`} className={pill(period.preset === "custom")}>
          Personalizado
        </Link>
        <HelpTip id="periodo" />
      </nav>
      {period.preset === "custom" && (
      <form method="get" action={`${base}/vendas`} className="flex flex-wrap items-end gap-3 rounded-2xl bg-white/90 px-4 py-3 text-sm text-stone-900 dark:bg-stone-900/90 dark:text-stone-100">
        <input type="hidden" name="p" value="custom" />
        <label className="flex flex-col gap-1">
          <span className="text-xs text-stone-500">De</span>
          <input type="date" name="de" defaultValue={period.firstDay} className="rounded-xl border border-stone-300/70 bg-white/60 px-3 py-1.5 dark:border-white/10 dark:bg-white/5" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-stone-500">Até</span>
          <input type="date" name="ate" defaultValue={period.lastDay} className="rounded-xl border border-stone-300/70 bg-white/60 px-3 py-1.5 dark:border-white/10 dark:bg-white/5" />
        </label>
        <button className="rounded-full bg-brand px-4 py-1.5 font-semibold text-white">Ver</button>
        <span className="ml-auto text-xs text-stone-500">
          {fullDay(period.firstDay)}{period.lastDay !== period.firstDay && ` a ${fullDay(period.lastDay)}`}
        </span>
      </form>
      )}
    </div>
  );
}
