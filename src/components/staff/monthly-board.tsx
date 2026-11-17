import Link from "next/link";
import { formatBRL, monthNamePt } from "@/domain";
import { Card } from "@/components/ui/page";
import type { payMonthly } from "@/lib/payouts/monthly";

type Data = NonNullable<Awaited<ReturnType<typeof payMonthly>>>;
const M = ({ children }: { children: React.ReactNode }) => <span className="money">{children}</span>;
const label = (m: string) => `${monthNamePt(m).slice(0, 3)}/${m.slice(2, 4)}`;

/**
 * D-PERIODPICK: o quadro "Mês a mês". Vendido, gerada e liberada contam no mês da venda; paga, no mês em que o Pix saiu;
 * a pagar é o que ainda falta pagar da comissão liberada daquele mês. Clicar no mês leva o seletor para ele.
 */
export function MonthlyBoard({ data, path, selected, title = "Mês a mês" }: { data: Data; path: string; selected: string | null; title?: string }) {
  const cols: { k: keyof Data["totals"]; t: string }[] = [
    { k: "salesCents", t: "Vendido" },
    { k: "commissionCents", t: "Comissão gerada" },
    { k: "releasedCents", t: "Liberada" },
    { k: "paidCents", t: "Paga (Pix)" },
    { k: "toPayCents", t: "A pagar" },
  ];
  const lines = [...data.lines].reverse();
  return (
    <Card title={title}>
      <div className="-mx-1 overflow-x-auto">
        <table className="w-full min-w-[620px] text-sm">
          <thead className="text-left text-[11px] uppercase tracking-wide text-stone-500">
            <tr className="border-b border-stone-200/70 dark:border-white/10">
              <th className="px-2 py-2 font-semibold">Mês</th>
              {cols.map((c) => <th key={c.k} className="px-2 py-2 text-right font-semibold">{c.t}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-200/60 dark:divide-white/10">
            {lines.map((l) => (
              <tr key={l.month} className={l.month === selected ? "bg-brand/8" : ""}>
                <td className="px-2 py-2">
                  <Link href={`${path}?p=m:${l.month}`} className="font-medium capitalize hover:underline" aria-label={`Ver ${monthNamePt(l.month)} de ${l.month.slice(0, 4)}`}>{label(l.month)}</Link>
                </td>
                {cols.map((c) => (
                  <td key={c.k} className={`px-2 py-2 text-right tabular-nums ${l[c.k] === 0 ? "text-stone-400" : ""} ${c.k === "toPayCents" && l[c.k] > 0 ? "font-semibold text-amber-800 dark:text-amber-300" : ""}`}>
                    <M>{formatBRL(l[c.k])}</M>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-stone-200/70 font-semibold dark:border-white/10">
              <td className="px-2 py-2">Total</td>
              {cols.map((c) => <td key={c.k} className="px-2 py-2 text-right tabular-nums"><M>{formatBRL(data.totals[c.k])}</M></td>)}
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="mt-3 text-xs text-stone-500">
        Vendido, comissão gerada e liberada contam no mês da venda. Paga conta no mês em que o Pix saiu. A pagar é a comissão liberada daquele mês que ainda não virou Pix
        {data.owedBefore > 0 ? <> (mais <M>{formatBRL(data.owedBefore)}</M> de meses anteriores)</> : null}. Liberada só aparece para quem bateu o mínimo no fechamento.
      </p>
    </Card>
  );
}
