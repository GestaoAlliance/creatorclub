"use client";

import { ArrowDownRight, ArrowRight, ArrowUpRight, Sparkles, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Avatar } from "@/components/ui/avatar";
import { ProductThumb } from "@/components/ui/product-thumb";
import { formatBRL, shortBRL, type Trend } from "@/domain";
import type { DashPeriod } from "@/lib/staff/dashboard";
import { Sparkline } from "../../creators/list-parts";
import { productDetailAction } from "./actions";

const M = ({ children }: { children: React.ReactNode }) => <span className="money">{children}</span>;

export type RankRow = {
  key: string;
  title: string;
  image: string | null;
  units: number;
  orders: number;
  revenueCents: number;
  unitCostCents: number | null;
  marginCents: number | null;
  trend: Trend;
  prevUnits: number;
  stockQty: number | null;
  coverDays: number | null;
  lowStock: boolean;
};
type Detail = NonNullable<Awaited<ReturnType<typeof productDetailAction>>>;

function TrendTag({ t, prev }: { t: Trend; prev: number }) {
  if (t.dir === "new") return <span title="Não vendeu no período anterior" className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-sky-700 dark:text-sky-300"><Sparkles className="size-3" />novo</span>;
  if (t.pct === null) return null;
  const cls = t.dir === "up" ? "text-emerald-700 dark:text-emerald-300" : t.dir === "down" ? "text-red-700 dark:text-red-300" : "text-stone-500";
  const Icon = t.dir === "up" ? ArrowUpRight : t.dir === "down" ? ArrowDownRight : ArrowRight;
  return <span title={`Período anterior: ${prev} un.`} className={`inline-flex items-center gap-0.5 text-[11px] font-semibold tabular-nums ${cls}`}><Icon className="size-3" />{t.pct > 0 ? "+" : ""}{t.pct}%</span>;
}

const marginTone = (pct: number) => (pct >= 60 ? "text-emerald-700 dark:text-emerald-300" : pct >= 35 ? "text-amber-700 dark:text-amber-300" : "text-red-700 dark:text-red-300");

/** Painel do produto (D-PRODUCTBOARD): creators que mais vendem, unidades por semana, preço, custo, margem e estoque. */
function Panel({ k, period, scope, onClose }: { k: string; period: DashPeriod; scope: "creators" | "loja"; onClose: () => void }) {
  const [d, setD] = useState<Detail | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    setD(undefined);
    void productDetailAction(k, period, scope).then((x) => live && setD(x));
    return () => {
      live = false;
    };
  }, [k, period, scope]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);
  const margin = d && d.priceCents && d.costCents !== null ? Math.round(((d.priceCents - d.costCents) / d.priceCents) * 100) : null;
  return (
    <>
      <button type="button" aria-label="Fechar" onClick={onClose} className="fixed inset-0 z-40 bg-stone-950/25 backdrop-blur-[2px] lg:hidden" />
      <aside aria-label="Produto" className="peek-panel glass fixed inset-x-2 bottom-2 top-16 z-50 flex flex-col overflow-hidden rounded-3xl lg:inset-x-auto lg:bottom-4 lg:right-4 lg:top-4 lg:w-[420px]">
        <header className="relative overflow-hidden px-5 pb-5 pt-5 text-white">
          <div aria-hidden className="brand-art absolute inset-0 -z-10" />
          <div className="flex justify-end"><button type="button" onClick={onClose} aria-label="Fechar (Esc)" className="peek-btn"><X className="size-4" /></button></div>
          {d && (
            <div className="mt-1 flex items-center gap-3">
              <span className="rounded-full bg-white p-1"><ProductThumb src={d.image} title={d.title} size="lg" /></span>
              <div className="min-w-0">
                <h2 className="text-lg font-semibold leading-tight">{d.title}</h2>
                <p className="text-xs text-white/80">{d.units} un. · <M>{formatBRL(d.cents)}</M> no período{scope === "creators" ? " com cupom de creator" : ""}</p>
              </div>
            </div>
          )}
        </header>
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-5 py-4 text-sm">
          {d === undefined && <p className="text-stone-400">Carregando…</p>}
          {d === null && <p className="text-stone-500">Não deu para abrir este produto.</p>}
          {d && (
            <>
              {/* D-PRODUCTSIMPLE: quem mais vendeu o produto vem primeiro, com a foto. */}
              <section>
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-stone-500">Creators que mais venderam este produto</p>
                {d.creators.length === 0 ? (
                  <p className="text-stone-500">Nenhuma creator vendeu este produto no período.</p>
                ) : (
                  <ol className="flex flex-col gap-1.5">
                    {d.creators.map((c, i) => (
                      <li key={c.id} className="flex items-center gap-2">
                        <span className="w-4 text-xs tabular-nums text-stone-400">{i + 1}</span>
                        <Avatar name={c.name} id={c.id} size="sm" />
                        <Link prefetch={false} href={`/admin/creators/${c.id}`} className="min-w-0 flex-1 truncate hover:underline">{c.name}</Link>
                        <span className="shrink-0 text-xs tabular-nums text-stone-500">{c.units} un. · <M>{shortBRL(c.cents)}</M></span>
                      </li>
                    ))}
                  </ol>
                )}
              </section>
              <section className="grid grid-cols-3 gap-2">
                {[
                  { label: "Preço", value: d.priceCents !== null ? <M>{formatBRL(d.priceCents)}</M> : "—" },
                  { label: "Custo", value: d.costCents !== null ? <M>{formatBRL(d.costCents)}</M> : "sem custo" },
                  { label: "Margem", value: margin !== null ? <span className={marginTone(margin)}>{margin}%</span> : "—" },
                ].map((t) => (
                  <div key={t.label} className="liquid-tile rounded-2xl px-3 py-2.5">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-500">{t.label}</p>
                    <p className="font-semibold tabular-nums">{t.value}</p>
                  </div>
                ))}
              </section>
              <section className="liquid-tile flex items-center justify-between gap-3 rounded-2xl px-3 py-2.5">
                <span>
                  <span className="block text-[11px] font-semibold uppercase tracking-wide text-stone-500">Unidades · 12 semanas</span>
                  <span className="text-xs text-stone-500">{d.stockQty !== null ? `estoque no Olist: ${d.stockQty} un.${d.stockDay ? ` (${d.stockDay.split("-").reverse().join("/")})` : ""}` : "sem leitura de estoque"}</span>
                </span>
                <Sparkline weeks={d.weeks} className="h-8 w-36" />
              </section>
            </>
          )}
        </div>
      </aside>
    </>
  );
}

/** Ranking de produtos (D-PRODUCTTHUMB, D-PRODUCTBOARD): posição, foto, nome, unidades com a tendência, receita com barra, margem e estoque. */
export function ProductRanking({ rows, period, scope }: { rows: RankRow[]; period: DashPeriod; scope: "creators" | "loja" }) {
  const [open, setOpen] = useState<string | null>(null);
  const close = useCallback(() => setOpen(null), []);
  const list = useRef<HTMLTableElement>(null);
  const colors = () => {
    const cs = list.current ? getComputedStyle(list.current) : null;
    return cs ? ({ "--brand": cs.getPropertyValue("--brand"), "--brand-2": cs.getPropertyValue("--brand-2") } as React.CSSProperties) : undefined;
  };
  return (
    <>
      {/* D-PRODUCTSIMPLE: tabela com as colunas nomeadas, como o ranking de creators; clicar abre o painel. */}
      <div className="overflow-x-auto">
        <table ref={list} className="w-full text-sm md:min-w-[720px]">
          <thead className="whitespace-nowrap text-left text-[11px] uppercase tracking-wide text-stone-500">
            <tr className="border-b border-stone-200/70 dark:border-white/10">
              <th className="w-12 px-4 py-2 font-semibold">#</th>
              <th className="px-3 py-2 font-semibold">Produto</th>
              <th className="hidden px-3 py-2 text-right font-semibold md:table-cell">Unidades</th>
              <th className="hidden px-3 py-2 text-right font-semibold md:table-cell">vs anterior</th>
              <th className="hidden px-3 py-2 text-right font-semibold md:table-cell">Receita</th>
              <th className="hidden px-3 py-2 text-right font-semibold md:table-cell">Margem</th>
              <th className="hidden px-4 py-2 text-right font-semibold md:table-cell">Estoque</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-200/70 dark:divide-white/10">
            {rows.map((r, i) => {
              const marginPct = r.marginCents !== null && r.revenueCents ? Math.round((r.marginCents / r.revenueCents) * 100) : null;
              return (
                <tr key={r.key} onClick={() => setOpen(r.key)} className={`cursor-pointer transition-colors ${open === r.key ? "bg-brand/8" : "hover:bg-stone-500/5"}`}>
                  <td className="px-4 py-2.5 tabular-nums text-stone-500">{i + 1}</td>
                  <td className="px-3 py-2.5">
                    <span className="flex items-center gap-3">
                      <ProductThumb src={r.image} title={r.title} />
                      <span className="min-w-0">
                        <button type="button" onClick={(e) => { e.stopPropagation(); setOpen(r.key); }} className="block text-left font-medium hover:underline md:max-w-[22rem] md:truncate">{r.title}</button>
                        <span className="block text-[11px] text-stone-500">{r.orders} {r.orders === 1 ? "pedido" : "pedidos"}{r.unitCostCents === null ? " · " : ""}{r.unitCostCents === null && <span className="text-amber-700 dark:text-amber-300">sem custo</span>}</span>
                        <span className="flex flex-wrap items-center gap-x-2 text-xs md:hidden"><span className="font-semibold tabular-nums">{r.units} un.</span><span className="tabular-nums"><M>{formatBRL(r.revenueCents)}</M></span><TrendTag t={r.trend} prev={r.prevUnits} />{r.lowStock && <span className="font-semibold text-red-700 dark:text-red-300">estoque {r.stockQty}</span>}</span>
                      </span>
                    </span>
                  </td>
                  <td className="hidden px-3 py-2.5 text-right md:table-cell font-semibold tabular-nums">{r.units}</td>
                  <td className="hidden px-3 py-2.5 text-right md:table-cell">
                    <TrendTag t={r.trend} prev={r.prevUnits} />
                    <span className="block text-[11px] tabular-nums text-stone-500">antes {r.prevUnits} un.</span>
                  </td>
                  <td className="hidden px-3 py-2.5 text-right md:table-cell font-semibold tabular-nums"><M>{formatBRL(r.revenueCents)}</M></td>
                  <td className={`hidden px-3 py-2.5 text-right md:table-cell font-semibold tabular-nums ${marginPct !== null ? marginTone(marginPct) : "text-stone-400"}`}>{marginPct !== null ? `${marginPct}%` : "—"}</td>
                  <td className={`hidden px-4 py-2.5 text-right md:table-cell tabular-nums ${r.lowStock ? "font-semibold text-red-700 dark:text-red-300" : "text-stone-600 dark:text-stone-300"}`}>
                    {r.stockQty !== null ? r.stockQty : "—"}
                    {r.lowStock && r.coverDays !== null && <span className="block text-[11px]">~{r.coverDays} dias</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {open && typeof document !== "undefined" && createPortal(<div className="dash" style={colors()}><Panel k={open} period={period} scope={scope} onClose={close} /></div>, document.body)}
    </>
  );
}
