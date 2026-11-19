import { ArrowDownRight, ArrowUpRight, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { M } from "@/components/staff/dashboard-view";
import { HideValuesToggle } from "@/components/staff/hide-values";
import { GlassLight } from "@/components/ui/glass-light";
import { ProductThumb } from "@/components/ui/product-thumb";
import { ui } from "@/components/ui/styles";
import { dayKey, formatBRL, shortBRL, trendOf } from "@/domain";
import { can } from "@/lib/auth/permissions";
import { currentActor } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { productBoard, STOCK_WARN_DAYS } from "@/lib/reports/product-board";
import type { ProductScope } from "@/lib/reports/products";
import { staffContext } from "@/lib/staff/context";
import { staffPeriod } from "@/lib/staff/period";
import { PeriodPicker } from "@/components/staff/period-picker";
import { ProductRanking } from "./ranking";

export const dynamic = "force-dynamic";

type Search = { p?: string; periodo?: string; de?: string; ate?: string; ver?: string };
const dmy = (k: string) => `${k.slice(8, 10)}/${k.slice(5, 7)}`;
const qs = (sp: Search, change: Partial<Search>) => {
  const next = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...sp, ...change })) if (v) next.set(k, v);
  const s = next.toString();
  return s ? `?${s}` : "";
};
const change = (now: number, before: number) => {
  const t = trendOf(now, before);
  return t.dir === "new" ? "novo" : t.pct === null ? "" : `${t.pct > 0 ? "+" : ""}${t.pct}% vs. anterior`;
};

// Produtos (M3.2, D-COST; D-PRODUCTBOARD, D-PRODUCTTHUMB): ranking com foto, tendência, margem e estoque; lucro do
// programa; subindo, caindo, acabando e os que não venderam; painel de cada produto.
export default async function ProductsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const actor = await currentActor();
  if (!actor) redirect("/entrar?next=/admin/vendas/produtos");
  const { brand } = await staffContext(actor);
  if (!brand) return <p className={ui.muted}>Nenhuma marca.</p>;
  if (!can(actor.grants, "money.view", brand.id)) redirect("/conta");
  const sp = await searchParams;
  const { timezone } = await db().brand.findUniqueOrThrow({ where: { id: brand.id }, select: { timezone: true } });
  const period = await staffPeriod(sp, timezone);
  const scope: ProductScope = sp.ver === "loja" ? "loja" : "creators";
  const b = await productBoard(db(), brand.id, period, scope);
  const r = b.report;
  const missingCost = r.productsTotal - r.productsWithCost;
  const low = b.rows.filter((x) => x.lowStock);

  return (
    <GlassLight className="dash flex flex-col gap-4">
      <section className="@container relative isolate overflow-hidden rounded-[32px] text-white shadow-[0_30px_60px_-34px_var(--brand)]">
        <div aria-hidden className="brand-art absolute inset-0 -z-10" />
        <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(80%_60%_at_50%_-20%,rgb(255_255_255/0.22),transparent_70%)]" />
        <div className="flex flex-col gap-5 p-5 md:p-7">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-white/70">{brand.name}</p>
              <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Produtos</h1>
              <p className="mt-1 max-w-xl text-sm text-white/80">
                {scope === "creators" ? "Vendas com cupom de creator" : "Todas as vendas da loja"} de {dmy(period.from)} a {dmy(period.to)}, comparadas com {dmy(b.previous.period.from)} a {dmy(b.previous.period.to)}.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <nav className="liquid-pill" style={{ "--n": 2, "--i": scope === "creators" ? 0 : 1 } as React.CSSProperties} aria-label="Vendas">
                <span aria-hidden className="drop" />
                <Link href={qs(sp, { ver: "" })} aria-current={scope === "creators" ? "true" : undefined}>Com cupom</Link>
                <Link href={qs(sp, { ver: "loja" })} aria-current={scope === "loja" ? "true" : undefined}>Loja inteira</Link>
              </nav>
              <PeriodPicker value={period.key ?? ""} today={dayKey(new Date(), timezone)} tone="brand" />
              <span className="rounded-full bg-white/90 text-stone-900"><HideValuesToggle /></span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 @3xl:grid-cols-4">
            {[
              { label: "Receita", value: <M>{formatBRL(r.totals.revenueCents)}</M>, hint: change(r.totals.revenueCents, b.previous.revenueCents) || `${r.totals.orders} pedidos` },
              { label: "Unidades", value: String(r.totals.units), hint: change(r.totals.units, b.previous.units) || `${r.rows.length} produtos` },
              // D-PRODUCTSIMPLE: o lucro do programa fica só em Vendas (Retorno do programa); "Atenção" virou "Acabando no estoque".
              { label: "Ticket médio", value: <M>{formatBRL(r.totals.orders ? Math.round(r.totals.revenueCents / r.totals.orders) : 0)}</M>, hint: "por pedido" },
              { label: "Acabando no estoque", value: String(low.length), hint: `estoque para ${STOCK_WARN_DAYS} dias ou menos`, red: low.length > 0 },
            ].map((t) => (
              <div key={t.label} className="frost-tile flex min-w-0 flex-col gap-0.5 rounded-2xl px-3.5 py-3 text-stone-900 dark:text-white">
                <span className="truncate text-[11px] font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-300">{t.label}</span>
                <span className={`whitespace-nowrap text-[clamp(1rem,5cqi,1.6rem)] font-semibold tabular-nums leading-tight ${"red" in t && t.red ? "text-red-700" : ""}`}>{t.value}</span>
                <span className="truncate text-[11px] text-stone-500 dark:text-stone-300">{t.hint}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 2xl:grid-cols-[minmax(0,1fr)_340px] 2xl:items-start">
        <section className="@container glass overflow-hidden rounded-3xl !p-0">
          <div className="flex items-baseline justify-between gap-3 px-4 pt-4 md:px-5">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">Ranking de produtos ({b.rows.length})</h2>
                      </div>
          {b.gifts > 0 && <p className="px-4 pt-1 text-[11px] text-stone-500 md:px-5">Fora do ranking: {b.gifts} brindes enviados junto com os pedidos (o custo deles entra no lucro).</p>}
          {missingCost > 0 && <p className="px-4 pt-1 text-[11px] text-amber-700 dark:text-amber-300 md:px-5">{missingCost} de {r.productsTotal} produtos sem custo na Shopify (campo &quot;Custo por item&quot;): a margem deles fica em branco. <Link href="/admin/sync" className="font-semibold underline">Atualizar catálogo</Link></p>}
          {b.rows.length === 0 ? (
            <p className="p-10 text-center text-sm text-stone-500">Nenhuma venda no período.</p>
          ) : (
            <ProductRanking
              rows={b.rows.map((x) => ({ key: x.key, title: x.title, image: x.image, units: x.units, orders: x.orders, revenueCents: x.revenueCents, unitCostCents: x.unitCostCents, marginCents: x.marginCents, trend: x.trend, prevUnits: x.prevUnits, stockQty: x.stockQty, coverDays: x.coverDays, lowStock: x.lowStock }))}
              period={period}
              scope={scope}
            />
          )}
        </section>

        <aside className="grid min-w-0 gap-4 md:grid-cols-2 md:items-start 2xl:flex 2xl:flex-col">
          {(b.rising.length > 0 || b.falling.length > 0) && (
            <section className="glass flex flex-col gap-3 rounded-3xl p-4">
              <h2 className={ui.h2}>Subindo e caindo</h2>
              <ul className="flex flex-col gap-2 text-sm">
                {b.rising.map((x) => (
                  <li key={`u${x.key}`} className="flex items-center gap-2">
                    <ProductThumb src={x.image} title={x.title} size="sm" />
                    <span className="min-w-0 flex-1 truncate">{x.title}</span>
                    <span className="inline-flex shrink-0 items-center gap-0.5 text-xs font-semibold tabular-nums text-emerald-700 dark:text-emerald-300"><ArrowUpRight className="size-3" />{x.prevUnits} → {x.units}</span>
                  </li>
                ))}
                {b.falling.map((x) => (
                  <li key={`d${x.key}`} className="flex items-center gap-2">
                    <ProductThumb src={x.image} title={x.title} size="sm" />
                    <span className="min-w-0 flex-1 truncate">{x.title}</span>
                    <span className="inline-flex shrink-0 items-center gap-0.5 text-xs font-semibold tabular-nums text-red-700 dark:text-red-300"><ArrowDownRight className="size-3" />{x.units} → {x.now}</span>
                  </li>
                ))}
              </ul>
              <p className="text-[11px] text-stone-500">Unidades no período anterior → agora.</p>
            </section>
          )}
          <section className="glass flex flex-col gap-3 rounded-3xl p-4">
            <h2 className={`${ui.h2} flex items-center gap-2`}><TriangleAlert className="size-4 text-amber-500" /> Acabando no estoque</h2>
            {low.length === 0 ? (
              <p className="text-sm text-stone-500">Nenhum produto vendido com estoque para {STOCK_WARN_DAYS} dias ou menos (Olist).</p>
            ) : (
              <ul className="flex flex-col gap-2 text-sm">
                {low.map((x) => (
                  <li key={x.key} className="flex items-center gap-2">
                    <ProductThumb src={x.image} title={x.title} size="sm" />
                    <span className="min-w-0 flex-1 truncate">{x.title}</span>
                    <span className="shrink-0 text-xs font-semibold tabular-nums text-red-700 dark:text-red-300">{x.stockQty} un. · ~{x.coverDays}d</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-[11px] text-stone-500">Estoque do Olist (lido a cada 30 min) e quantos dias dura no ritmo de vendas do período.</p>
          </section>
          <p className="px-1 text-[11px] text-stone-400 md:col-span-2">{shortBRL(r.totals.revenueCents)} em {r.totals.orders} pedidos · venda conta no dia do pagamento.</p>
        </aside>
      </div>
    </GlassLight>
  );
}
