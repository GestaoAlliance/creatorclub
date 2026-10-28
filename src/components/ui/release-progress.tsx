import { formatBRL } from "@/domain";
import type { ReleaseProgress } from "@/lib/commission/release";

const day = (d: Date) => d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" });

/** D-MIN100: o que conta para o mínimo — "vendas acumuladas" ou "comissão acumulada" (Botanika). */
export function releaseWhat(r: Pick<ReleaseProgress, "basis">): string {
  return r.basis === "COMMISSION" ? "comissão acumulada" : "vendas acumuladas";
}

/** Frase curta do próximo fechamento (D-CONTRACT): libera no dia 1 se o acumulado chegar ao mínimo. */
export function releaseNote(r: ReleaseProgress): string {
  if (r.minCents === null) return "contrato sem comissão";
  const missing = r.minCents - r.accumulatedCents;
  return missing <= 0 ? `libera em ${day(r.nextClosingAt)}` : `faltam ${formatBRL(missing)} ${r.basis === "COMMISSION" ? "de comissão" : "em vendas"} para liberar`;
}

/** Barra "vendas acumuladas X de mínimo" para o fechamento do mês. */
export function ReleaseProgressBar({ r }: { r: ReleaseProgress }) {
  if (r.minCents === null) return null;
  const pct = Math.min(100, Math.round((r.accumulatedCents / r.minCents) * 100));
  const reached = r.accumulatedCents >= r.minCents;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs text-stone-600 dark:text-stone-400">
        <span>
          {r.basis === "COMMISSION" ? "Comissão acumulada" : "Vendas acumuladas"} <strong className="tabular-nums text-stone-900 dark:text-stone-100">{formatBRL(r.accumulatedCents)}</strong> de{" "}
          {formatBRL(r.minCents)}
        </span>
        <span>{reached ? `mínimo atingido · libera em ${day(r.nextClosingAt)}` : `fechamento em ${day(r.nextClosingAt)}`}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-stone-200/70 dark:bg-white/10" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
        <div className={`h-full rounded-full ${reached ? "bg-emerald-500" : "bg-brand"}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
