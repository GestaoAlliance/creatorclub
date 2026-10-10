import Link from "next/link";
import { formatBRL } from "@/domain";
import { PERIOD_PRESETS } from "@/lib/portal/period";
import { SALE_STATUS_LABEL, type SalesPage, type SaleStatus } from "@/lib/portal/sales";
import { SalesChart } from "./sales-chart";

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

/** Vendas do portal (E7.3, D-SALESVIEW): sem dados do cliente. Só exibe. `noCommission`: UGC, sem taxa e comissão (D-UGCPORTAL). */
export function SalesView({ page, base, noCommission = false }: { page: SalesPage; base: string; noCommission?: boolean }) {
  const { totals } = page;
  const kpis = [
    ["Pedidos", String(totals.count)],
    ["Vendas", formatBRL(totals.baseCents)],
    ...(noCommission ? [] : [["Comissão", formatBRL(totals.commissionCents)]]),
    ["Ticket médio", formatBRL(totals.ticketCents)],
  ];
  return (
    <div className="flex flex-col gap-4">
      <PeriodPicker page={page} base={base} />

      {/* Computador: três cartões. Celular: um cartão com uma linha por número (valores altos não cabem em três colunas). */}
      <section className={`hidden gap-3 md:grid ${noCommission ? "grid-cols-3" : "grid-cols-4"}`}>
        {kpis.map(([label, value]) => (
          <div key={label} className="glass rounded-3xl p-4">
            <p className="text-xs text-stone-600 dark:text-stone-400">{label}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
          </div>
        ))}
      </section>
      <section className="glass divide-y divide-stone-200/70 rounded-3xl px-4 md:hidden dark:divide-white/10">
        {kpis.map(([label, value]) => (
          <div key={label} className="flex items-baseline justify-between py-3">
            <span className="text-sm text-stone-600 dark:text-stone-400">{label}</span>
            <span className="text-lg font-semibold tabular-nums">{value}</span>
          </div>
        ))}
      </section>

      {page.days.length > 1 && (
        <section className="glass rounded-3xl p-4 md:p-5">
          <SalesChart days={page.days} noCommission={noCommission} />
        </section>
      )}

      <section className="glass rounded-3xl p-2 md:p-4">
        {page.sales.length === 0 ? (
          <p className="py-10 text-center text-sm text-stone-500">Nenhuma venda paga com seu cupom neste período.</p>
        ) : (
          <>
            <table className="hidden w-full text-sm md:table">
              <thead className="text-left text-xs text-stone-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Pedido</th>
                  <th className="px-3 py-2 font-medium">Pago em</th>
                  <th className="px-3 py-2 text-right font-medium">{noCommission ? "Valor" : "Base"}</th>
                  {!noCommission && <th className="px-3 py-2 text-right font-medium">Taxa</th>}
                  {!noCommission && <th className="px-3 py-2 text-right font-medium">Comissão</th>}
                  <th className="px-3 py-2 font-medium">Situação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-200/70 dark:divide-white/10">
                {page.sales.map((s) => (
                  <tr key={s.orderId}>
                    <td className="px-3 py-3 font-medium">{s.orderName}</td>
                    <td className="px-3 py-3 text-stone-600 dark:text-stone-400">{day(s.paidAt)}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{formatBRL(s.baseCents)}</td>
                    {!noCommission && <td className="px-3 py-3 text-right tabular-nums">{pct(s.rateBps)}</td>}
                    {!noCommission && (
                      <td className={`px-3 py-3 text-right font-semibold tabular-nums ${s.commissionCents < 0 ? "text-red-700 dark:text-red-400" : ""}`}>
                        {formatBRL(s.commissionCents)}
                      </td>
                    )}
                    <td className="px-3 py-3"><Badge status={s.status} noCommission={noCommission} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <ul className="divide-y divide-stone-200/70 md:hidden dark:divide-white/10">
              {page.sales.map((s) => (
                <li key={s.orderId} className="flex items-center justify-between gap-3 px-2 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">Pedido {s.orderName}</p>
                    <p className="text-xs text-stone-500">
                      {noCommission ? day(s.paidAt) : `${day(s.paidAt)} · ${formatBRL(s.baseCents)} × ${pct(s.rateBps)}`}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className="text-sm font-semibold tabular-nums">{formatBRL(noCommission ? s.baseCents : s.commissionCents)}</span>
                    <Badge status={s.status} noCommission={noCommission} />
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
      <p className="px-1 text-xs text-stone-500">
        {noCommission ? "Valor" : "Base"} = valor dos produtos com desconto, sem frete. A venda conta no dia em que o pedido foi pago.
        {!noCommission && page.release.minCents !== null &&
          ` A comissão é liberada no dia 1 do mês seguinte quando as vendas acumuladas chegam a ${formatBRL(page.release.minCents)}.`}
      </p>
    </div>
  );
}

const fullDay = (key: string) => `${key.slice(8, 10)}/${key.slice(5, 7)}/${key.slice(0, 4)}`;

/** Hoje · Ontem · 7 dias · Este mês · Personalizado (D-PERIOD). Uma linha, acima de tudo o que ela filtra. */
function PeriodPicker({ page, base }: { page: SalesPage; base: string }) {
  const { period } = page;
  const pill = (on: boolean) => `shrink-0 rounded-full px-4 py-1.5 text-sm ${on ? "bg-brand font-semibold text-white" : "glass"}`;
  return (
    <div className="flex flex-col gap-2">
      <nav aria-label="Período" className="flex flex-wrap gap-2">
        {PERIOD_PRESETS.map((p) => (
          <Link key={p.key} href={`${base}/vendas?p=${p.key}`} className={pill(period.preset === p.key)} aria-current={period.preset === p.key ? "page" : undefined}>
            {p.label}
          </Link>
        ))}
        <Link href={`${base}/vendas?p=custom&de=${period.firstDay}&ate=${period.lastDay}`} className={pill(period.preset === "custom")}>
          Personalizado
        </Link>
      </nav>
      {period.preset === "custom" && (
      <form method="get" action={`${base}/vendas`} className="glass flex flex-wrap items-end gap-3 rounded-2xl px-4 py-3 text-sm">
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
