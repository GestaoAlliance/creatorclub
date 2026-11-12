import { Clock } from "lucide-react";
import Link from "next/link";
import { ORIGIN_LABEL, shortBRL } from "@/domain";
import type { OriginSummaryRow } from "@/lib/creators/origin";

const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : null);

function Step({ label, value, of, rate, tone }: { label: string; value: number; of: number; rate: string | null; tone: string }) {
  const w = of ? Math.max(value ? 4 : 0, Math.round((value / of) * 100)) : 0;
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="flex items-baseline justify-between gap-1 text-[11px] text-stone-500">
        <span className="truncate uppercase tracking-wide">{label}</span>
        {rate && <span className="shrink-0 tabular-nums">{rate}</span>}
      </span>
      <span className="h-2 overflow-hidden rounded-full bg-stone-300/50 dark:bg-white/10">
        <span className={`block h-full rounded-full ${tone}`} style={{ width: `${w}%` }} />
      </span>
      <span className="text-sm font-semibold tabular-nums">{value || "—"}</span>
    </div>
  );
}

/**
 * Aba Origem (D-ORIGIN; D-PERFBOARD): funil por canal (inscritas → aprovadas → ativas → venderam no mês), com a taxa de
 * cada passo, as vendas do mês e o tempo médio da entrada até a 1ª venda.
 */
export function OriginView({ rows, monthLabel }: { rows: OriginSummaryRow[]; monthLabel: string }) {
  if (rows.length === 0) return <section className="glass rounded-3xl p-8 text-center text-sm text-stone-500">Nenhuma creator ou inscrição ainda.</section>;
  return (
    <div className="flex flex-col gap-4">
      <section className="glass rounded-3xl p-3 text-sm text-stone-600 md:p-4 dark:text-stone-300">
        Inscrições e aprovações contam desde o início; ativas é hoje; vendas e &quot;venderam&quot; são de {monthLabel}. Importadas sem origem aparecem como &quot;Não informada&quot;: marque na ficha. A 1ª venda conta da entrada da creator no sistema.
      </section>
      <ul className="flex flex-col gap-3">
        {rows.map((r) => {
          const top = Math.max(r.applications, r.approved, r.active, 1);
          return (
            <li key={r.key} className="@container liquid-tile rounded-3xl p-4">
              <div className="grid gap-4 @3xl:grid-cols-[14rem_minmax(0,1fr)_9rem] @3xl:items-center">
                <div className="min-w-0">
                  <Link href={`/admin/creators?origem=${encodeURIComponent(r.key)}`} className="block truncate font-semibold hover:underline">{ORIGIN_LABEL[r.origin.kind]}</Link>
                  {r.origin.hunter && <span className="block truncate text-xs text-stone-500">{r.origin.hunter.name}</span>}
                  {r.origin.campaign && <span className="block truncate text-xs text-stone-500">campanha {r.origin.campaign}</span>}
                  {r.origin.kind === "HUNTER" && !r.origin.hunter && <span className="block text-xs text-stone-500">hunter não identificado</span>}
                </div>
                <div className="grid grid-cols-2 gap-3 @xl:grid-cols-4">
                  <Step label="Inscritas" value={r.applications} of={top} rate={null} tone="bg-stone-400" />
                  <Step label="Aprovadas" value={r.approved} of={top} rate={r.applications ? pct(r.approved, r.applications) : null} tone="bg-sky-500" />
                  <Step label="Ativas" value={r.active} of={top} rate={null} tone="bg-brand dark:bg-brand-2" />
                  <Step label="Venderam" value={r.sellers} of={top} rate={pct(r.sellers, r.active)} tone="bg-emerald-500" />
                </div>
                <div className="flex items-end justify-between gap-3 @3xl:flex-col @3xl:items-end">
                  <span className="text-right">
                    <span className="block text-lg font-semibold tabular-nums"><span className="money">{shortBRL(r.salesCents)}</span></span>
                    <span className="block text-[11px] text-stone-500">vendas no mês</span>
                  </span>
                  {r.active > 0 && <span className="inline-flex items-center gap-1 text-xs text-stone-600 dark:text-stone-300" title={r.firstSales ? `média de ${r.firstSales} creator${r.firstSales === 1 ? "" : "s"}` : undefined}>
                    <Clock className="size-3.5" />
                    {r.daysToFirstSale !== null ? `1ª venda em ~${r.daysToFirstSale} ${r.daysToFirstSale === 1 ? "dia" : "dias"}` : "1ª venda: sem dado ainda"}
                  </span>}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
