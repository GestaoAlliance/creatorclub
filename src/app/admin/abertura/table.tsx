import { AlertTriangle, CheckCircle2, Minus } from "lucide-react";
import Link from "next/link";
import { formatBRL, shortBRL } from "@/domain";
import type { OpeningRow } from "@/lib/withdrawals/opening";
import { Avatar } from "../creators/list-parts";
import { OpeningForm } from "./forms";

const day = (d: Date) => d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "2-digit" });
const M = ({ children }: { children: React.ReactNode }) => <span className="money">{children}</span>;

/** A conta da abertura em barra: comissão no sistema − já pago = saldo que fica (D-PAYBOARD). */
function Equation({ ledger, paid }: { ledger: number; paid: number | null }) {
  const after = paid === null ? null : ledger - paid;
  const pct = ledger > 0 && paid !== null ? Math.min(100, Math.round((paid / ledger) * 100)) : paid ? 100 : 0;
  const neg = after !== null && after < 0;
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1.5 text-center text-sm sm:gap-2 sm:text-base">
        <span><span className="block text-[11px] uppercase tracking-wide text-stone-500">No sistema</span><span className="block font-semibold tabular-nums"><M>{formatBRL(ledger)}</M></span></span>
        <Minus className="size-4 text-stone-400" />
        <span><span className="block text-[11px] uppercase tracking-wide text-stone-500">Já pago</span><span className="block font-semibold tabular-nums"><M>{paid === null ? "?" : formatBRL(paid)}</M></span></span>
        <span className="text-stone-400">=</span>
        <span><span className="block text-[11px] uppercase tracking-wide text-stone-500">Fica</span><span className={`block font-semibold tabular-nums ${neg ? "text-red-700 dark:text-red-400" : "text-emerald-700 dark:text-emerald-300"}`}><M>{after === null ? "?" : formatBRL(after)}</M></span></span>
      </div>
      <span className="flex h-2 overflow-hidden rounded-full bg-emerald-500/30" title="parte já paga">
        <span className={`h-full ${neg ? "bg-red-500" : "bg-stone-400 dark:bg-stone-500"}`} style={{ width: `${pct}%` }} />
      </span>
      {neg && (
        <p className="flex items-start gap-1.5 rounded-xl bg-red-500/10 px-3 py-2 text-xs text-red-800 dark:text-red-300">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />Fica negativo em {formatBRL(-after!)}: abate das próximas comissões (ela não recebe até cobrir).
        </p>
      )}
    </div>
  );
}

/** Faixa e cartões da abertura: a aprovar (com a conta à vista e o formulário) e já liberadas. */
export function OpeningBoard({ rows, brandName }: { rows: OpeningRow[]; brandName: string }) {
  const pending = rows.filter((r) => !r.unlockedAt && r.status !== "DEACTIVATED");
  const done = rows.filter((r) => r.unlockedAt);
  const today = pending.reduce((s, r) => s + r.ledgerCents, 0);
  const after = pending.reduce((s, r) => s + (r.ledgerCents - (r.paid?.cents ?? 0)), 0);
  const negatives = pending.filter((r) => r.paid && r.ledgerCents - r.paid.cents < 0);
  const tiles = [
    { label: "A aprovar", value: String(pending.length), hint: `${pending.filter((r) => r.paid).length} com comprovantes`, dot: pending.length ? "seg-warn" : "seg-good" },
    { label: "Saldo hoje", value: <M>{shortBRL(today)}</M>, hint: "comissão no sistema das pendentes", dot: "seg-info" },
    { label: "Saldo previsto", value: <M>{shortBRL(after)}</M>, hint: "depois de descontar o já pago", dot: "seg-info" },
    { label: "Ficam negativas", value: String(negatives.length), hint: negatives.length ? <M>{formatBRL(negatives.reduce((s, r) => s + (r.ledgerCents - r.paid!.cents), 0))}</M> : "ninguém", dot: negatives.length ? "seg-bad" : "seg-good" },
  ];
  return (
    <div className="flex flex-col gap-4">
      <section className="@container relative isolate overflow-hidden rounded-[32px] text-white shadow-[0_30px_60px_-34px_var(--brand)]">
        <div aria-hidden className="brand-art absolute inset-0 -z-10" />
        <div className="flex flex-col gap-5 p-5 md:p-7">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-white/70">{brandName}</p>
            <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Saldo de abertura</h1>
            <p className="mt-1 max-w-2xl text-sm text-white/80">O que já foi pago antes do Creator Club sai do saldo como &quot;Saldo de abertura&quot; e o saque é liberado. Confira com os comprovantes antes de aprovar.</p>
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

      {pending.length === 0 ? (
        <section className="glass rounded-3xl p-10 text-center text-sm text-stone-500">Nenhuma creator esperando o saldo de abertura. 🎉</section>
      ) : (
        <div className="@container">
          <ul className="grid grid-cols-[minmax(0,1fr)] gap-3 @4xl:grid-cols-2">
            {pending.map((r) => {
              return (
                <li key={r.creatorId} className="liquid-tile flex min-w-0 flex-col gap-4 rounded-3xl p-4 md:p-5">
                  <div className="flex items-center gap-3">
                    <Avatar name={r.name} />
                    <span className="min-w-0 flex-1">
                      <Link href={`/admin/creators/${r.creatorId}`} className="block truncate font-semibold hover:underline">{r.name}</Link>
                      <span className="block text-xs text-stone-500">{r.paid ? "comprovantes registrados" : "sem comprovantes registrados"}{r.ready ? " · números conferidos" : ""}</span>
                    </span>
                  </div>
                  <Equation ledger={r.ledgerCents} paid={r.paid?.cents ?? null} />
                  <div className="border-t border-stone-200/70 pt-4 dark:border-white/10">
                    <OpeningForm creatorId={r.creatorId} name={r.name} ledgerCents={r.ledgerCents} legacyPayments={r.legacyPayments} paidInfo={r.paid} />
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <section className="glass flex flex-col gap-2 rounded-3xl p-4">
        <h3 className="flex items-center gap-1.5 font-semibold"><CheckCircle2 className="size-4 text-emerald-600" />Saque liberado <span className="text-stone-500">{done.length}</span></h3>
        {done.length === 0 ? (
          <p className="text-sm text-stone-500">Nenhuma ainda.</p>
        ) : (
          <ul className="divide-y divide-stone-200/70 dark:divide-white/10">
            {done.map((r) => (
              <li key={r.creatorId} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                <span className="min-w-0">
                  <Link href={`/admin/creators/${r.creatorId}`} className="font-medium hover:underline">{r.name}</Link>
                  <span className="block text-xs text-stone-500">
                    liberado em {day(r.unlockedAt!)} · já pago {r.openingCents === null ? "nada" : formatBRL(-r.openingCents)}
                    {r.openingNote && ` · ${r.openingNote.replace(/^Já pago antes do Creator Club: /, "")}`}
                  </span>
                </span>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${r.ledgerCents < 0 ? "bg-red-500/12 text-red-800 dark:text-red-300" : "bg-emerald-500/12 text-emerald-800 dark:text-emerald-300"}`}>saldo {formatBRL(r.ledgerCents)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
