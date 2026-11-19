import Link from "next/link";
import { ORIGIN_LABEL, shortBRL } from "@/domain";
import type { OriginSummaryRow } from "@/lib/creators/origin";

const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : null);

/**
 * Aba Origem (D-ORIGIN; D-PERFBOARD; D-IGSIMPLE: em tabela): funil por canal (inscritas → aprovadas → ativas → venderam no mês), com a taxa de
 * cada passo, as vendas do mês e o tempo médio da entrada até a 1ª venda.
 */
export function OriginView({ rows, phrase }: { rows: OriginSummaryRow[]; phrase: string }) {
  if (rows.length === 0) return <section className="glass rounded-3xl p-8 text-center text-sm text-stone-500">Nenhuma creator ou inscrição ainda.</section>;
  return (
    <div className="flex flex-col gap-4">
      <section className="glass rounded-3xl p-3 text-sm text-stone-600 md:p-4 dark:text-stone-300">
        Inscrições, aprovações, vendas e &quot;venderam&quot; contam {phrase}; ativas é hoje. Importadas sem origem aparecem como &quot;Não informada&quot;: marque na ficha. A 1ª venda conta da entrada da creator no sistema.
      </section>
      {/* D-IGSIMPLE: uma linha por canal, para comparar. */}
      <section className="glass overflow-hidden rounded-3xl !p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm md:min-w-[780px]">
            <thead className="whitespace-nowrap text-left text-[11px] uppercase tracking-wide text-stone-500">
              <tr className="border-b border-stone-200/70 dark:border-white/10">
                <th className="px-4 py-2 font-semibold">Canal</th>
                <th className="hidden px-3 py-2 text-right font-semibold md:table-cell">Inscritas</th>
                <th className="hidden px-3 py-2 text-right font-semibold md:table-cell">Aprovadas</th>
                <th className="hidden px-3 py-2 text-right font-semibold md:table-cell">Ativas</th>
                <th className="hidden px-3 py-2 text-right font-semibold md:table-cell">Venderam</th>
                <th className="hidden px-3 py-2 text-right font-semibold md:table-cell">Vendas</th>
                <th className="hidden px-4 py-2 text-right font-semibold md:table-cell">1ª venda em</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-200/70 dark:divide-white/10">
              {rows.map((r) => {
                const firstSale = r.active > 0 ? (r.daysToFirstSale !== null ? `~${r.daysToFirstSale} ${r.daysToFirstSale === 1 ? "dia" : "dias"}` : "sem dado") : "—";
                return (
                  <tr key={r.key} className="hover:bg-stone-500/5">
                    <td className="px-4 py-2.5">
                      <Link href={`/admin/creators?origem=${encodeURIComponent(r.key)}`} className="font-medium hover:underline">{ORIGIN_LABEL[r.origin.kind]}</Link>
                      {r.origin.hunter && <span className="block text-[11px] text-stone-500">{r.origin.hunter.name}</span>}
                      {r.origin.campaign && <span className="block text-[11px] text-stone-500">campanha {r.origin.campaign}</span>}
                      {r.origin.kind === "HUNTER" && !r.origin.hunter && <span className="block text-[11px] text-stone-500">hunter não identificado</span>}
                      <span className="mt-0.5 block text-xs text-stone-600 md:hidden dark:text-stone-300">
                        {r.applications} inscritas · {r.approved} aprovadas · {r.active} ativas · {r.sellers} venderam · <span className="money font-semibold">{shortBRL(r.salesCents)}</span>
                      </span>
                    </td>
                    <td className="hidden px-3 py-2.5 text-right tabular-nums md:table-cell">{r.applications || "—"}</td>
                    <td className="hidden px-3 py-2.5 text-right tabular-nums md:table-cell">{r.approved || "—"}{r.applications ? <span className="block text-[11px] text-stone-500">{pct(r.approved, r.applications)}</span> : null}</td>
                    <td className="hidden px-3 py-2.5 text-right tabular-nums md:table-cell">{r.active || "—"}</td>
                    <td className="hidden px-3 py-2.5 text-right tabular-nums md:table-cell">{r.sellers || "—"}{r.active ? <span className="block text-[11px] text-stone-500">{pct(r.sellers, r.active)} das ativas</span> : null}</td>
                    <td className="hidden px-3 py-2.5 text-right font-semibold tabular-nums md:table-cell"><span className="money">{shortBRL(r.salesCents)}</span></td>
                    <td className="hidden px-4 py-2.5 text-right text-xs text-stone-600 md:table-cell dark:text-stone-300" title={r.firstSales ? `média de ${r.firstSales} creator${r.firstSales === 1 ? "" : "s"}` : undefined}>{firstSale}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
