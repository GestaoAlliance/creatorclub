"use client";

import { ArrowDownRight, ArrowRight, ArrowUpRight, Check, Copy, Sparkles } from "lucide-react";
import { useState } from "react";
import { agoText, formatBRL, lastSaleTone, trendOf, type SaleTone } from "@/domain";

/** Iniciais no círculo com a cor da marca. */
export function Avatar({ name, size = "md" }: { name: string; size?: "md" | "lg" }) {
  const ini = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  return (
    <span
      aria-hidden
      className={`grid shrink-0 place-content-center rounded-full bg-[radial-gradient(120%_120%_at_25%_10%,color-mix(in_srgb,var(--brand)_70%,white),var(--brand)_55%,color-mix(in_srgb,var(--brand)_75%,black))] font-semibold text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.35),0_4px_10px_-4px_var(--brand)] ${size === "lg" ? "size-14 text-lg" : "size-9 text-xs"}`}
    >
      {ini}
    </span>
  );
}

/** Mini gráfico das semanas (barras; a semana atual mais forte). */
export function Sparkline({ weeks, className = "h-6 w-24" }: { weeks: number[]; className?: string }) {
  const max = Math.max(...weeks, 1);
  const n = weeks.length;
  const total = weeks.reduce((s, v) => s + v, 0);
  if (!total) return <span className={`${className} flex items-center text-[11px] text-stone-400`}>sem vendas</span>;
  return (
    <svg viewBox={`0 0 ${n * 6} 24`} preserveAspectRatio="none" className={`${className} overflow-visible`} role="img" aria-label={`Vendas nas últimas ${n} semanas`}>
      {weeks.map((v, i) => {
        const h = v ? Math.max(2, (v / max) * 22) : 1;
        return <rect key={i} x={i * 6 + 0.75} y={24 - h} width={4.5} height={h} rx={1.2} className={v ? (i === n - 1 ? "fill-brand dark:fill-brand-2" : "fill-brand/45 dark:fill-brand-2/50") : "fill-stone-300/70 dark:fill-white/15"}>
          <title>{`${n - 1 - i === 0 ? "Esta semana" : `${n - 1 - i} semana${n - 1 - i === 1 ? "" : "s"} atrás`}: ${formatBRL(v)}`}</title>
        </rect>;
      })}
    </svg>
  );
}

/** Seta de alta/queda dos últimos 30 dias contra os 30 anteriores. */
export function TrendChip({ current, previous }: { current: number; previous: number }) {
  const t = trendOf(current, previous);
  if (t.dir === "new") return <span title="Vendeu nos últimos 30 dias e nada nos 30 anteriores" className="inline-flex items-center gap-0.5 rounded-full bg-sky-500/12 px-1.5 py-0.5 text-[11px] font-semibold text-sky-700 dark:text-sky-300"><Sparkles className="size-3" />voltou</span>;
  if (t.pct === null) return null;
  const cls = t.dir === "up" ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300" : t.dir === "down" ? "bg-red-500/10 text-red-700 dark:text-red-300" : "bg-stone-500/10 text-stone-600 dark:text-stone-300";
  const Icon = t.dir === "up" ? ArrowUpRight : t.dir === "down" ? ArrowDownRight : ArrowRight;
  return (
    <span title={`30 dias anteriores: ${formatBRL(previous)}`} className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ${cls}`}>
      <Icon className="size-3" />
      {t.pct > 0 ? "+" : ""}
      {t.pct}%
    </span>
  );
}

const TONE: Record<SaleTone, { dot: string; text: string }> = {
  fresh: { dot: "bg-emerald-500 shadow-[0_0_0_3px_rgb(16_185_129/0.18)]", text: "text-stone-700 dark:text-stone-200" },
  cooling: { dot: "bg-amber-500 shadow-[0_0_0_3px_rgb(245_158_11/0.18)]", text: "text-amber-800 dark:text-amber-300" },
  cold: { dot: "bg-red-500 shadow-[0_0_0_3px_rgb(239_68_68/0.16)]", text: "text-red-700 dark:text-red-300" },
  never: { dot: "bg-stone-300 dark:bg-white/25", text: "text-stone-400" },
};

/** "Última venda há X dias" com a bolinha colorida (verde até 15 dias, âmbar até 45, vermelho depois). */
export function LastSale({ day, daysAgo }: { day: string | null; daysAgo: number | null }) {
  const t = TONE[lastSaleTone(daysAgo)];
  return (
    <span title={day ? `Última venda em ${day.split("-").reverse().join("/")}` : "Nunca vendeu"} className={`inline-flex items-center gap-2 whitespace-nowrap text-xs ${t.text}`}>
      <span className={`size-2 shrink-0 rounded-full ${t.dot}`} />
      {daysAgo === null ? "nunca vendeu" : agoText(daysAgo)}
    </span>
  );
}

/** Botão de copiar no estilo da linha/painel (sem o fundo da marca). */
export function CopyChip({ value, label, className = "peek-chip" }: { value: string; label: string; className?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className={className}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          // Sem acesso à área de transferência: dá para selecionar o texto.
        }
      }}
    >
      {done ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      {done ? "Copiado" : label}
    </button>
  );
}
