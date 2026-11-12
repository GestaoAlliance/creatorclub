"use client";

import Link from "next/link";
import { useState } from "react";
import { formatBRL, groupPaymentCheck, shortBRL } from "@/domain";
import type { PaymentCheckRow } from "@/lib/sheets/pagamentos";

const brl = (c: number | null) => (c === null ? "—" : formatBRL(c));
const pct = (bps: number | null) => (bps === null ? "—" : `${(bps / 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`);
const day = (k: string) => `${k.slice(8, 10)}/${k.slice(5, 7)}`;
const M = ({ children }: { children: React.ReactNode }) => <span className="money">{children}</span>;
type Filter = "diff" | "big" | "all";

/** Conferência da planilha por creator (S3, D-PAYBOARD): faixa, filtros e a diferença em R$ de cada uma. Só compara. */
export function CheckBoard({ rows, brandName, lastRead }: { rows: PaymentCheckRow[]; brandName: string; lastRead: string }) {
  const [filter, setFilter] = useState<Filter>("diff");
  const groups = groupPaymentCheck(rows);
  const withDiff = groups.filter((g) => g.issues > 0);
  const shown = filter === "all" ? groups : filter === "big" ? withDiff.filter((g) => g.absDiffCents >= 5_000) : withDiff;
  const total = groups.reduce((s, g) => s + g.diffCents, 0);
  const tiles = [
    { label: "Creators na planilha", value: String(groups.length), hint: `${rows.length} linhas`, dot: "seg-info" },
    { label: "Com diferença", value: String(withDiff.length), hint: `${rows.filter((r) => r.issues.length).length} linhas`, dot: withDiff.length ? "seg-warn" : "seg-good" },
    { label: "Planilha − sistema", value: <M>{shortBRL(total)}</M>, hint: total > 0 ? "a planilha paga mais" : total < 0 ? "a planilha paga menos" : "bate", dot: total ? "seg-warn" : "seg-good" },
    { label: "Última leitura", value: lastRead.split(" ")[0] ?? "—", hint: lastRead.split(" ")[1] ? `às ${lastRead.split(" ")[1]}` : "ainda não lida", dot: "seg-info" },
  ];
  const chips: [Filter, string][] = [["diff", `Só diferenças (${withDiff.length})`], ["big", "Acima de R$ 50"], ["all", `Todas (${groups.length})`]];
  return (
    <div className="flex flex-col gap-4">
      <section className="@container relative isolate overflow-hidden rounded-[32px] text-white shadow-[0_30px_60px_-34px_var(--brand)]">
        <div aria-hidden className="brand-art absolute inset-0 -z-10" />
        <div className="flex flex-col gap-5 p-5 md:p-7">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-white/70">{brandName}</p>
            <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Conferência da planilha</h1>
            <p className="mt-1 max-w-2xl text-sm text-white/80">A planilha &quot;Pagamentos influencers&quot; contra o que o sistema calculou (vendas pela data do pagamento e comissão do extrato). Só mostra: nada muda no saldo.</p>
          </div>
          <div className="grid grid-cols-2 gap-2 @3xl:grid-cols-4">
            {tiles.map((t) => (
              <div key={t.label} className="seg-tile frost-tile flex min-w-0 flex-col items-start gap-0.5 rounded-2xl px-3.5 py-3 text-stone-900 dark:text-white">
                <span className="flex w-full items-center justify-between gap-2 text-[11px] font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-300"><span className="truncate">{t.label}</span><span className={`seg-dot ${t.dot}`} /></span>
                <span className="text-xl font-semibold tabular-nums leading-tight @3xl:text-2xl">{t.value}</span>
                <span className="w-full truncate text-[11px] text-stone-500 dark:text-stone-300">{t.hint}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="glass flex flex-wrap items-center gap-1.5 rounded-3xl p-3 md:p-4">
        {chips.map(([f, label]) => (
          <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)} className={`rounded-full px-3 py-1.5 text-sm transition ${filter === f ? "bg-brand font-semibold text-white dark:bg-brand-2 dark:text-stone-900" : "bg-stone-500/10 hover:bg-stone-500/20"}`}>{label}</button>
        ))}
      </section>

      {rows.length === 0 ? (
        <section className="glass rounded-3xl p-10 text-center text-sm text-stone-500">A planilha ainda não foi lida. Ela entra pelo script de leitura (docs/sheets/leitura.gs).</section>
      ) : shown.length === 0 ? (
        <section className="glass rounded-3xl p-10 text-center text-sm text-stone-500">Tudo confere com o sistema. 🎉</section>
      ) : (
        <div className="@container">
          <ul className="grid gap-3 @4xl:grid-cols-2">
            {shown.map((g) => (
              <li key={g.key} className="liquid-tile flex flex-col gap-3 rounded-3xl p-4">
                <div className="flex items-start justify-between gap-3">
                  <span className="min-w-0">
                    {g.creatorId ? <Link href={`/admin/creators/${g.creatorId}`} className="block truncate font-semibold hover:underline">{g.name}</Link> : <span className="block truncate font-semibold">{g.name}</span>}
                    <span className="block font-mono text-xs text-stone-500">{g.coupons.join(" · ")}</span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className={`block font-semibold tabular-nums ${g.lines.every((r) => !r.system || r.payCents === null) ? "text-stone-500" : g.diffCents === 0 ? "text-emerald-700 dark:text-emerald-300" : "text-amber-700 dark:text-amber-300"}`}><M>{g.lines.every((r) => !r.system || r.payCents === null) ? "sem comparação" : g.diffCents === 0 ? "bate" : `${g.diffCents > 0 ? "+" : "−"}${formatBRL(Math.abs(g.diffCents))}`}</M></span>
                    <span className="block text-[11px] text-stone-500">planilha − sistema</span>
                  </span>
                </div>
                <ul className="flex flex-col divide-y divide-stone-200/60 text-sm dark:divide-white/10">
                  {g.lines.map((r) => (
                    <li key={`${r.tab}-${r.row}`} className="flex flex-col gap-1 py-2">
                      <span className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-medium">{r.tab} <span className="text-xs font-normal text-stone-500">{day(r.from)} a {day(r.to)}</span></span>
                        <span className="flex flex-wrap gap-1">
                          {r.issues.length === 0 ? <span className="rounded-full bg-emerald-500/12 px-2 py-0.5 text-[11px] text-emerald-800 dark:text-emerald-300">confere</span> : r.issues.map((i) => <span key={i} className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] text-amber-900 dark:text-amber-200">{i}</span>)}
                        </span>
                      </span>
                      <span className="grid gap-x-3 text-xs text-stone-600 sm:grid-cols-2 dark:text-stone-300">
                        <span><span className="text-stone-500">Planilha: </span>vendas <M>{brl(r.salesCents)}</M> · {pct(r.rateBps)} · paga <M>{brl(r.payCents)}</M></span>
                        <span><span className="text-stone-500">Sistema: </span>{r.system ? <>vendas <M>{brl(r.system.salesCents)}</M> · {r.system.rates.length ? r.system.rates.map((x) => pct(x)).join(", ") : "—"} · comissão <M>{brl(r.system.commissionCents)}</M></> : "cupom não encontrado"}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
