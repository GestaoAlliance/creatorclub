import { ArrowDownRight, ArrowUpRight, Minus, Search as SearchIcon } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SalesChart } from "@/components/portal/sales-chart";
import { HeroStat, M, OverviewCards } from "@/components/staff/dashboard-view";
import { Card } from "@/components/ui/page";
import { HideValuesToggle } from "@/components/staff/hide-values";
import { PeriodPicker } from "@/components/staff/period-picker";
import { Avatar } from "@/components/ui/avatar";
import { GlassLight } from "@/components/ui/glass-light";
import { ui } from "@/components/ui/styles";
import { CREATOR_CATEGORY_LABEL, dayKey, formatBRL, nextDayKey, periodPhrase, pickPeriod, shortBRL, startOfLocalDay, type CreatorCategoryValue } from "@/domain";
import { can } from "@/lib/auth/permissions";
import { currentActor } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { productReport } from "@/lib/reports/products";
import { staffContext } from "@/lib/staff/context";
import { staffDashboard, type DashCategory } from "@/lib/staff/dashboard";
import { baseHealth } from "@/lib/staff/insights";
import { staffPeriod } from "@/lib/staff/period";
import { shipmentBoard } from "@/lib/shipments/board";
import { ShippedProductsCard } from "../envios/board";

export const dynamic = "force-dynamic";

type Search = { p?: string; periodo?: string; de?: string; ate?: string; tipo?: string; ordem?: string; q?: string };
const CATS: { id: DashCategory; label: string }[] = [
  { id: "", label: "Todos os tipos" },
  { id: "INFLUENCER", label: "Influencer" },
  { id: "PRESCRITOR", label: "Prescritor" },
  { id: "UGC", label: "UGC" },
];
const SORTS = [
  ["vendas", "Vendas"],
  ["comissao", "Comissão"],
  ["pedidos", "Pedidos"],
  ["ticket", "Ticket médio"],
  ["variacao", "Mais subiu"],
] as const;
const pct = (v: number) => `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
const dm = (k: string | null) => (k ? `${k.slice(8, 10)}/${k.slice(5, 7)}` : "—");

/**
 * D-SALESRANK (responsável, daily de 2026-11-19): Vendas é a tela de decisão. Números do período com a comparação, o
 * ranking de creators (vendas, pedidos, comissão, ticket, variação, última venda) e, embaixo, quem subiu, caiu, fez a
 * 1ª venda, saúde da base e produtos mais vendidos. "Venda" = valor dos produtos dos pedidos pagos, pela data do
 * pagamento (o mesmo da comissão). A conferência pedido a pedido está na aba Pedidos.
 */
export default async function SalesRankingPage({ searchParams }: { searchParams: Promise<Search> }) {
  const actor = await currentActor();
  if (!actor) redirect("/entrar?next=/admin/vendas");
  const { brand } = await staffContext(actor);
  if (!brand) return <p className={ui.muted}>Nenhuma marca.</p>;
  if (!can(actor.grants, "money.view", brand.id)) redirect("/admin");
  const sp = await searchParams;
  const tz = (await db().brand.findUniqueOrThrow({ where: { id: brand.id }, select: { timezone: true } })).timezone;
  const period = await staffPeriod(sp, tz);
  const today = dayKey(new Date(), tz);
  const category = CATS.find((c) => c.id === sp.tipo)?.id ?? "";
  const range = { gte: startOfLocalDay(period.from, tz), lt: startOfLocalDay(nextDayKey(period.to), tz) };
  const [d, health, products, ship] = await Promise.all([
    staffDashboard(db(), brand.id, period, category),
    baseHealth(db(), brand.id, category, range),
    productReport(db(), brand.id, period, "creators"),
    // D-SHIPSIMPLE: o relatório de produtos enviados (antes na Visão geral do Desempenho).
    can(actor.grants, "shipping.view", brand.id) ? shipmentBoard(db(), actor, brand.id, [], new Date(), range) : Promise.resolve(null),
  ]);
  const k = d.kpis;
  const phrase = periodPhrase(pickPeriod(period.key ?? null, today));
  const ordem = SORTS.find(([v]) => v === sp.ordem)?.[0] ?? "vendas";
  const q = (sp.q ?? "").trim().toLowerCase();
  const rows = d.ranking
    .filter((r) => !q || r.name.toLowerCase().includes(q) || (r.instagram ?? "").toLowerCase().includes(q))
    .sort((a, b) =>
      ordem === "comissao" ? b.commissionCents - a.commissionCents
      : ordem === "pedidos" ? b.orders - a.orders
      : ordem === "ticket" ? b.ticketCents - a.ticketCents
      : ordem === "variacao" ? (b.salesCents - b.beforeCents) - (a.salesCents - a.beforeCents)
      : b.salesCents - a.salesCents);
  const keep = (extra: Record<string, string>) => {
    const u = new URLSearchParams();
    if (period.key) u.set("p", period.key);
    if (category) u.set("tipo", category);
    if (sp.q) u.set("q", sp.q);
    if (ordem !== "vendas") u.set("ordem", ordem);
    for (const [kk, v] of Object.entries(extra)) if (v) u.set(kk, v); else u.delete(kk);
    const s = u.toString();
    return `/admin/vendas${s ? `?${s}` : ""}`;
  };

  return (
    <GlassLight className="dash @container flex min-w-0 flex-col gap-6">
      <section className="relative overflow-hidden rounded-[30px] p-5 text-white shadow-[0_26px_60px_-30px_var(--brand)] md:p-6">
        <div aria-hidden className="brand-art absolute inset-0" />
        <div aria-hidden className="absolute inset-0 bg-[radial-gradient(120%_80%_at_50%_-20%,rgb(255_255_255/0.22),transparent_60%)]" />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-white/70">{brand.name}</p>
            <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Vendas de creators</h1>
            <p className="text-sm text-white/80">{phrase} · comparado com o período anterior do mesmo tamanho</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <PeriodPicker value={period.key ?? ""} today={today} tone="brand" />
            <span className="rounded-full bg-white/90 text-stone-900"><HideValuesToggle /></span>
          </div>
        </div>
        <div className="relative mt-5 grid grid-cols-2 gap-3 @3xl:grid-cols-4">
          <HeroStat label="Vendas de creators" value={<M>{formatBRL(k.sales.cents)}</M>} change={k.sales.change} hint={<>{k.sales.orders} pedidos · {pct(k.sales.storeShare)} da loja</>} />
          <HeroStat label="Comissão gerada" value={<M>{formatBRL(k.commission.cents)}</M>} change={k.commission.change} hint={<>{pct(k.commission.rate)} das vendas</>} />
          <HeroStat label="Creators vendendo" value={k.creators.sold} change={k.creators.change} hint={<>de {k.creators.active} ativas{d.stopped ? ` · ${d.stopped} pararam` : ""}</>} />
          <HeroStat label="Ticket médio" value={<M>{formatBRL(k.units.ticketCents)}</M>} change={null} hint={<>por pedido</>} />
        </div>
      </section>

      {/* D-HOMELINE: o gráfico por dia saiu do Início e fica aqui, embaixo dos números. */}
      <Card title="Vendas de creators por dia">
        <div className="money-chart">
          <SalesChart days={d.days} previous={d.prevDays} bands={d.campaigns} />
        </div>
      </Card>

      <section className="glass overflow-hidden rounded-3xl !p-0">
        <header className="flex flex-col gap-3 border-b border-stone-200/70 p-4 dark:border-white/10 md:p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-base font-semibold">Ranking de creators <span className="font-normal text-stone-500">· {rows.length} {rows.length === 1 ? "vendeu" : "venderam"} {phrase}</span></h2>
            {d.concentration.alert && <span className="rounded-full bg-amber-500/15 px-2.5 py-1 text-xs font-semibold text-amber-900 dark:text-amber-200">A maior faz {pct(d.concentration.top1)} das vendas</span>}
          </div>
          <form className="flex flex-wrap items-center gap-2" role="search">
            {period.key && <input type="hidden" name="p" value={period.key} />}
            <label className="relative min-w-0 flex-[1_1_14rem]">
              <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-stone-400" />
              <input name="q" defaultValue={sp.q ?? ""} placeholder="Buscar creator" aria-label="Buscar creator" className={`${ui.input} !rounded-full pl-10`} />
            </label>
            <select name="tipo" defaultValue={category} aria-label="Tipo" className={`${ui.inputSm} !rounded-full`}>
              {CATS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
            <select name="ordem" defaultValue={ordem} aria-label="Ordenar por" className={`${ui.inputSm} !rounded-full`}>
              {SORTS.map(([v, l]) => <option key={v} value={v}>Ordenar: {l}</option>)}
            </select>
            <button className={ui.btnSm}>Aplicar</button>
            {(sp.q || category || ordem !== "vendas") && <Link href={keep({ q: "", tipo: "", ordem: "" })} className={`${ui.link} text-sm`}>Limpar</Link>}
          </form>
        </header>
        {rows.length === 0 ? (
          <p className="p-10 text-center text-sm text-stone-500">Nenhuma venda de creator {phrase}.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm md:min-w-[760px]">
              <thead className="text-left text-[11px] uppercase tracking-wide text-stone-500">
                <tr className="border-b border-stone-200/70 dark:border-white/10">
                  <th className="w-12 px-4 py-2 font-semibold">#</th>
                  <th className="px-3 py-2 font-semibold">Creator</th>
                  <th className="hidden px-3 py-2 text-right font-semibold md:table-cell">Vendas</th>
                  <th className="hidden px-3 py-2 text-right font-semibold md:table-cell">Pedidos</th>
                  <th className="hidden px-3 py-2 text-right font-semibold md:table-cell">Comissão</th>
                  <th className="hidden px-3 py-2 text-right font-semibold md:table-cell">Ticket</th>
                  <th className="hidden px-3 py-2 text-right font-semibold md:table-cell">vs anterior</th>
                  <th className="hidden px-4 py-2 text-right font-semibold md:table-cell">Última venda</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-200/70 dark:divide-white/10">
                {rows.map((r) => {
                  const diff = r.salesCents - r.beforeCents;
                  const Icon = diff > 0 ? ArrowUpRight : diff < 0 ? ArrowDownRight : Minus;
                  return (
                    <tr key={r.id} className="hover:bg-stone-500/5">
                      <td className="px-4 py-2.5 tabular-nums text-stone-500">{r.position}</td>
                      <td className="px-3 py-2.5">
                        {/* Foto da creator no ranking (pedido do responsável, 2026-11-19). */}
                        <span className="flex items-center gap-3">
                          <Avatar name={r.name} id={r.id} />
                          <span className="min-w-0">
                            <Link prefetch={false} href={`/admin/creators/${r.id}`} className="font-medium hover:underline">{r.name}</Link>
                            <span className="block text-[11px] text-stone-500">
                              {r.categories.map((c) => CREATOR_CATEGORY_LABEL[c as CreatorCategoryValue] ?? c).join(" · ") || "—"}{r.instagram ? ` · @${r.instagram}` : ""} · {pct(r.share)} das vendas
                            </span>
                            {/* No celular, os números principais embaixo do nome (a tabela inteira não cabe). */}
                            <span className="flex flex-wrap gap-x-2 text-xs md:hidden"><span className="font-semibold tabular-nums"><M>{formatBRL(r.salesCents)}</M></span><span>{r.orders} pedidos</span><span className={r.salesCents >= r.beforeCents ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"}>{r.change === null ? "nova" : `${r.change > 0 ? "+" : ""}${r.change.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%`}</span></span>
                          </span>
                        </span>
                      </td>
                      <td className="hidden px-3 py-2.5 text-right md:table-cell font-semibold tabular-nums"><M>{formatBRL(r.salesCents)}</M></td>
                      <td className="hidden px-3 py-2.5 text-right md:table-cell tabular-nums">{r.orders}</td>
                      <td className="hidden px-3 py-2.5 text-right md:table-cell tabular-nums"><M>{formatBRL(r.commissionCents)}</M></td>
                      <td className="hidden px-3 py-2.5 text-right md:table-cell tabular-nums"><M>{formatBRL(r.ticketCents)}</M></td>
                      <td className={`hidden px-3 py-2.5 text-right md:table-cell tabular-nums ${diff > 0 ? "text-emerald-700 dark:text-emerald-400" : diff < 0 ? "text-red-700 dark:text-red-400" : "text-stone-500"}`}>
                        <span className="inline-flex items-center gap-0.5"><Icon className="size-3.5" />{r.change === null ? "nova" : `${r.change > 0 ? "+" : ""}${r.change.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%`}</span>
                        <span className="block text-[11px] text-stone-500">antes <M>{shortBRL(r.beforeCents)}</M></span>
                      </td>
                      <td className="hidden px-4 py-2.5 text-right md:table-cell text-stone-600 dark:text-stone-300">{dm(r.lastSaleDay)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="border-t border-stone-200/70 px-4 py-3 text-xs text-stone-500 dark:border-white/10 md:px-5">
          Venda = valor dos produtos dos pedidos pagos com o cupom dela, pela data do pagamento (o mesmo que vira comissão). Para conferir pedido a pedido, aba <Link href="/admin/vendas/pedidos" className={ui.link}>Pedidos</Link>.
        </p>
      </section>

      <OverviewCards d={d} health={health} program={products.program} productsWithoutCost={products.productsTotal - products.productsWithCost} topCreators={false} />
      {ship && <ShippedProductsCard month={ship.month} periodLabel={phrase} />}
    </GlassLight>
  );
}
