import { Download, Search as SearchIcon } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SalesChart } from "@/components/portal/sales-chart";
import { M, Stat, TopCreatorsCard } from "@/components/staff/dashboard-view";
import { HideValuesToggle } from "@/components/staff/hide-values";
import { Card, PageHeader } from "@/components/ui/page";
import { badge, ui } from "@/components/ui/styles";
import { formatBRL, SALE_STATUS_LABEL, SALE_STATUSES, type SaleStatus } from "@/domain";
import { can } from "@/lib/auth/permissions";
import { currentActor } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { listSales, SALES_PAGE_SIZE } from "@/lib/sales/list";
import { DASH_PRESETS, staffDashboard } from "@/lib/staff/dashboard";
import { staffContext } from "@/lib/staff/context";
import { filtersOf, salesPeriod, searchesAllTime, type Search } from "./filters";

export const dynamic = "force-dynamic";

const STATUS_BADGE: Record<SaleStatus, string> = { PAID: badge.green, PENDING: badge.amber, REFUNDED: badge.red, CANCELLED: badge.neutral, TEST: badge.sky };
const dmy = (k: string) => `${k.slice(8, 10)}/${k.slice(5, 7)}`;
const pct = (v: number) => `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

const query = (sp: Search, change: Partial<Search>) => {
  const next = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...sp, ...change })) if (v) next.set(k, v);
  const s = next.toString();
  return s ? `?${s}` : "";
};

// Vendas no modelo da referência (M0.1 + gráfico e top creators): período, números com comparação, vendas por dia,
// top creators e a lista de todas as vendas da loja com a creator que levou (ou o motivo).
export default async function SalesPage({ searchParams }: { searchParams: Promise<Search> }) {
  const actor = await currentActor();
  if (!actor) redirect("/entrar?next=/admin/vendas");
  const { brand } = await staffContext(actor);
  if (!brand) return <p className={ui.muted}>Nenhuma marca.</p>;
  if (!can(actor.grants, "money.view", brand.id)) redirect("/conta");
  const sp = await searchParams;
  const { timezone } = await db().brand.findUniqueOrThrow({ where: { id: brand.id }, select: { timezone: true } });
  const period = salesPeriod(sp, timezone);
  const f = filtersOf(sp, period);
  const page = Math.max(1, Number.parseInt(sp.pagina ?? "1", 10) || 1);
  const [r, d] = await Promise.all([listSales(db(), brand.id, f, page), staffDashboard(db(), brand.id, period, "")]);
  const pages = Math.max(1, Math.ceil(r.total / SALES_PAGE_SIZE));
  const when = (x: Date) => x.toLocaleString("pt-BR", { timeZone: r.timezone, dateStyle: "short", timeStyle: "short" });
  const allCount = SALE_STATUSES.reduce((s, k) => s + r.counts[k], 0);
  const k = d.kpis;
  const ticketStore = d.store.paidOrders ? Math.round(d.store.salesCents / d.store.paidOrders) : 0;
  const keep = { periodo: sp.periodo ?? "", de: sp.de ?? "", ate: sp.ate ?? "" };

  return (
    <div className="dash flex flex-col gap-6">
      <PageHeader
        title="Vendas"
        actions={
          <span className="flex items-center gap-2">
            <HideValuesToggle />
            <a href={`/admin/vendas/csv${query(sp, { pagina: "" })}`} className={ui.ghost}>
              <Download className="size-4" /> Exportar CSV
            </a>
          </span>
        }
      >
        Todas as vendas da loja que chegaram da Shopify, com a creator que levou cada uma (ou o motivo). {dmy(period.from)} a {dmy(period.to)}, comparado com{" "}
        {dmy(d.previous.from)} a {dmy(d.previous.to)}.
      </PageHeader>

      <div className="flex flex-wrap items-center gap-2">
        {DASH_PRESETS.map((p) => (
          <Link key={p.id} href={`/admin/vendas${query({ ...sp, de: "", ate: "" }, { periodo: p.id, pagina: "" })}`} className={period.preset === p.id ? ui.pillOn : ui.pill}>
            {p.label}
          </Link>
        ))}
        <form className="flex flex-wrap items-center gap-1.5">
          {sp.q && <input type="hidden" name="q" value={sp.q} />}
          {sp.situacao && <input type="hidden" name="situacao" value={sp.situacao} />}
          {sp.dona && <input type="hidden" name="dona" value={sp.dona} />}
          <input type="date" name="de" defaultValue={period.preset ? "" : period.from} aria-label="De" className={ui.inputSm} />
          <span className={ui.hint}>até</span>
          <input type="date" name="ate" defaultValue={period.preset ? "" : period.to} aria-label="Até" className={ui.inputSm} />
          <button className={ui.ghostSm}>Aplicar</button>
        </form>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Vendas da loja" value={<M>{formatBRL(d.store.salesCents)}</M>} change={d.store.change} hint={<>{d.store.paidOrders} pedidos pagos · ticket <M>{formatBRL(ticketStore)}</M></>} />
        <Stat label="Vendas com cupom de creator" value={<M>{formatBRL(k.sales.cents)}</M>} change={k.sales.change} hint={<>{pct(k.sales.storeShare)} da loja · {k.sales.orders} pedidos</>} />
        <Stat label="Comissão gerada" value={<M>{formatBRL(k.commission.cents)}</M>} change={k.commission.change} hint={<>{pct(k.commission.rate)} das vendas de creators</>} />
        <Stat label="Creators que venderam" value={k.creators.sold} change={k.creators.change} hint={<>de {k.creators.active} ativas · ticket <M>{formatBRL(k.units.ticketCents)}</M></>} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card title="Vendas de creators por dia">
          <div className="money-chart">
            <SalesChart days={d.days} />
          </div>
          <p className={ui.hint}>Pela data do pagamento, só pagas, como a comissão.</p>
        </Card>
        <TopCreatorsCard d={d} />
      </div>

      <section className={`${ui.card} gap-4`}>
        <div className="flex flex-wrap items-center gap-1.5">
          <Link href={`/admin/vendas${query(sp, { situacao: "", pagina: "" })}`} className={`rounded-full px-3 py-1 text-sm ${f.status ? "text-stone-600 hover:bg-stone-500/10 dark:text-stone-300" : "bg-stone-900 text-white dark:bg-white dark:text-stone-900"}`}>
            Todas <span className="tabular-nums opacity-60">{allCount}</span>
          </Link>
          {SALE_STATUSES.map((s) => (
            <Link key={s} href={`/admin/vendas${query(sp, { situacao: s, pagina: "" })}`} className={`rounded-full px-3 py-1 text-sm ${f.status === s ? "bg-stone-900 text-white dark:bg-white dark:text-stone-900" : "text-stone-600 hover:bg-stone-500/10 dark:text-stone-300"}`}>
              {SALE_STATUS_LABEL[s]} <span className="tabular-nums opacity-60">{r.counts[s]}</span>
            </Link>
          ))}
        </div>
        <form className="flex flex-wrap items-center gap-2" role="search">
          {Object.entries(keep).map(([n, v]) => v && <input key={n} type="hidden" name={n} value={v} />)}
          {f.status && <input type="hidden" name="situacao" value={f.status} />}
          <label className="relative min-w-60 flex-1">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-stone-400" />
            <input name="q" defaultValue={f.q} placeholder="Buscar por pedido, cupom ou creator" aria-label="Buscar venda" className={`${ui.input} pl-9`} />
          </label>
          <select name="dona" defaultValue={sp.dona ?? ""} aria-label="Creator" className={ui.inputSm}>
            <option value="">Com e sem creator</option>
            <option value="creator">Só com creator</option>
            <option value="sem">Só sem creator</option>
          </select>
          <button className={ui.btnSm}>Buscar</button>
        </form>
        <p className={ui.hint}>
          {r.total} {r.total === 1 ? "venda" : "vendas"} · <M>{formatBRL(r.subtotalCents)}</M> em produtos (sem frete, a base da comissão) ·{" "}
          {searchesAllTime(sp) ? "busca em todas as datas" : `pedidos feitos de ${dmy(period.from)} a ${dmy(period.to)}`}
        </p>

        {r.rows.length === 0 ? (
          <p className={ui.muted}>Nenhuma venda com esses filtros.</p>
        ) : (
          <>
            {/* Celular: um cartão por venda. */}
            <ul className="flex flex-col divide-y divide-stone-200/70 md:hidden dark:divide-white/10">
              {r.rows.map((o) => (
                <li key={o.id} className="flex flex-col gap-1.5 py-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-mono text-sm font-semibold">{o.name}</span>
                    <span className="font-semibold tabular-nums"><M>{formatBRL(o.subtotalCents)}</M></span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 text-xs">
                    <span className={STATUS_BADGE[o.status]}>{SALE_STATUS_LABEL[o.status]}</span>
                    {o.codes.map((c) => <span key={c} className="rounded-md bg-stone-500/10 px-1.5 py-0.5 font-mono">{c}</span>)}
                    <span className="text-stone-500">{when(o.createdAt)}</span>
                  </div>
                  <p className="text-sm">
                    {o.creatorId ? <Link href={`/admin/creators/${o.creatorId}`} className={ui.link}>{o.creatorName}</Link> : <span className="text-stone-500">{o.reason}</span>}
                  </p>
                </li>
              ))}
            </ul>
            <div className="-mx-2 hidden overflow-x-auto md:block">
              <table className="w-full min-w-[860px] border-separate border-spacing-0 text-sm">
                <thead>
                  <tr className="[&>th]:px-3 [&>th]:py-2 [&>th]:text-left [&>th]:text-xs [&>th]:font-medium [&>th]:uppercase [&>th]:tracking-wide [&>th]:text-stone-500">
                    <th>Data</th>
                    <th>Pedido</th>
                    <th>Situação</th>
                    <th>Cupom</th>
                    <th>Creator</th>
                    <th className="!text-right">Produtos</th>
                    <th className="!text-right">Comissão</th>
                  </tr>
                </thead>
                <tbody>
                  {r.rows.map((o) => (
                    <tr key={o.id} className="align-top transition-colors hover:bg-stone-500/5 [&>td]:border-t [&>td]:border-stone-200/70 [&>td]:px-3 [&>td]:py-2.5 dark:[&>td]:border-white/10">
                      <td className="whitespace-nowrap text-xs text-stone-500">{when(o.createdAt)}</td>
                      <td className="font-mono font-semibold">{o.name}</td>
                      <td><span className={STATUS_BADGE[o.status]}>{SALE_STATUS_LABEL[o.status]}</span></td>
                      <td>
                        <span className="flex flex-wrap gap-1">
                          {o.codes.length ? o.codes.map((c) => <span key={c} className="rounded-md bg-stone-500/10 px-1.5 py-0.5 font-mono text-xs">{c}</span>) : <span className="text-stone-400">—</span>}
                        </span>
                      </td>
                      <td className="max-w-64">
                        {o.creatorId ? (
                          <Link href={`/admin/creators/${o.creatorId}`} className="font-medium hover:underline">{o.creatorName}</Link>
                        ) : (
                          <span className="text-xs text-stone-500">{o.reason}</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap text-right tabular-nums">
                        <span className="font-semibold"><M>{formatBRL(o.subtotalCents)}</M></span>
                        <span className="block text-xs text-stone-500">total <M>{formatBRL(o.totalCents)}</M></span>
                      </td>
                      <td className="whitespace-nowrap text-right text-xs tabular-nums">
                        {o.commissionCents === null ? (
                          <span className="text-stone-400">—</span>
                        ) : o.status === "PENDING" && o.commissionCents === 0 ? (
                          <span className="text-stone-500">quando pagar</span>
                        ) : (
                          <M>{formatBRL(o.commissionCents)}</M>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {pages > 1 && (
          <div className="flex items-center justify-between gap-3 text-sm">
            {page > 1 ? <Link href={`/admin/vendas${query(sp, { pagina: String(page - 1) })}`} className={ui.ghostSm}>← Anteriores</Link> : <span />}
            <span className={ui.hint}>página {Math.min(page, pages)} de {pages}</span>
            {page < pages ? <Link href={`/admin/vendas${query(sp, { pagina: String(page + 1) })}`} className={ui.ghostSm}>Próximas →</Link> : <span />}
          </div>
        )}
      </section>
    </div>
  );
}
