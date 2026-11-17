"use client";

import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { pickPeriod, rangeKey, stepMonth } from "@/domain";

const COOKIE = "cc_period";

/**
 * D-PERIODPICK: o seletor de tempo das telas da equipe (o mesmo em todas). ‹ mês › anda mês a mês; "30 dias", "Ano" e
 * o calendário (de/até). A escolha fica guardada e vale nas outras abas até mudar.
 */
export function PeriodPicker({ value, today, tone = "glass" }: { value: string; today: string; tone?: "glass" | "brand" }) {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  const p = pickPeriod(value, today);
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(p.from);
  const [to, setTo] = useState(p.to);

  const go = (key: string) => {
    try {
      document.cookie = `${COOKIE}=${encodeURIComponent(key)}; path=/; max-age=31536000; samesite=lax`;
    } catch {}
    const q = new URLSearchParams(params.toString());
    for (const k of ["p", "periodo", "de", "ate", "pagina", "mes"]) q.delete(k);
    q.set("p", key);
    setOpen(false);
    router.push(`${path}?${q.toString()}`);
  };

  const shell = tone === "brand"
    ? "bg-white/16 text-white shadow-[inset_0_0_0_1px_rgb(255_255_255/0.25)] backdrop-blur"
    : "glass text-stone-800 dark:text-stone-100";
  const btn = tone === "brand" ? "hover:bg-white/20" : "hover:bg-stone-500/10";
  const on = tone === "brand" ? "bg-white text-stone-900" : "bg-brand text-white";
  const atNow = p.kind === "month" && p.month === today.slice(0, 7);

  return (
    <div className="relative">
      <div className={`flex w-fit max-w-full items-center gap-0.5 overflow-x-auto rounded-full p-1 text-xs font-medium sm:gap-1 ${shell}`} role="group" aria-label="Período">
        <button type="button" onClick={() => go(stepMonth(p, -1, today))} className={`grid size-7 shrink-0 place-content-center rounded-full ${btn}`} aria-label="Mês anterior"><ChevronLeft className="size-4" /></button>
        <span className={`min-w-[7.5rem] shrink-0 whitespace-nowrap rounded-full px-1.5 py-1 text-center text-[13px] font-semibold sm:min-w-[9.5rem] sm:px-2 sm:text-sm ${p.kind === "month" ? "" : "opacity-90"}`}>{p.label}</span>
        <button type="button" onClick={() => go(stepMonth(p, 1, today))} disabled={atNow} className={`grid size-7 shrink-0 place-content-center rounded-full disabled:opacity-30 ${btn}`} aria-label="Mês seguinte"><ChevronRight className="size-4" /></button>
        <span aria-hidden className="mx-0.5 h-4 w-px bg-current opacity-20" />
        <button type="button" onClick={() => go("30d")} className={`shrink-0 whitespace-nowrap rounded-full px-2 py-1 sm:px-2.5 ${p.kind === "days" ? on : btn}`}>30 dias</button>
        <button type="button" onClick={() => go(`y:${(p.month ?? p.to).slice(0, 4)}`)} className={`shrink-0 rounded-full px-2 py-1 sm:px-2.5 ${p.kind === "year" ? on : btn}`}>Ano</button>
        <button type="button" onClick={() => setOpen((x) => !x)} className={`grid size-7 shrink-0 place-content-center rounded-full ${p.kind === "range" ? on : btn}`} aria-label="Escolher datas" aria-expanded={open}><CalendarDays className="size-4" /></button>
      </div>
      {open && (
        <form
          onSubmit={(e) => { e.preventDefault(); if (from && to && from <= to) go(rangeKey(from, to)); }}
          className="glass absolute left-0 z-30 mt-2 flex w-72 max-w-[calc(100vw-2rem)] bg-white/95 dark:bg-stone-900/95 sm:left-auto sm:right-0 flex-col gap-2 rounded-2xl p-3 text-sm text-stone-800 shadow-xl dark:text-stone-100"
        >
          <label className="flex items-center justify-between gap-2">De <input type="date" value={from} max={today} onChange={(e) => setFrom(e.target.value)} className="rounded-lg border border-stone-300/70 bg-white/70 px-2 py-1 dark:border-white/10 dark:bg-white/5" /></label>
          <label className="flex items-center justify-between gap-2">Até <input type="date" value={to} max={today} onChange={(e) => setTo(e.target.value)} className="rounded-lg border border-stone-300/70 bg-white/70 px-2 py-1 dark:border-white/10 dark:bg-white/5" /></label>
          <button disabled={!from || !to || from > to} className="self-end rounded-full bg-brand px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-40">Aplicar</button>
        </form>
      )}
    </div>
  );
}
