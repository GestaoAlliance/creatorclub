"use client";

import { useState } from "react";
import { HelpTip } from "@/components/ui/tour";
import { ORIGIN_LABEL, shortBRL } from "@/domain";
import type { OriginSummaryRow } from "@/lib/creators/origin";
import type { instagramRanking } from "@/lib/instagram/ranking";
import type { UgcCard } from "@/lib/performance/board";
import { InstagramView } from "./instagram";
import { OriginView } from "./origin";
import { UgcView } from "./ugc";

type Tab = "instagram" | "ugc" | "origem";
type Ig = Awaited<ReturnType<typeof instagramRanking>>;

const n = (v: number) => v.toLocaleString("pt-BR");

/**
 * Desempenho (D-PERFBOARD): faixa da marca com três quadros que trocam a vista (Instagram, UGC, Origem). O ranking de
 * vendas saiu (está no Início); mínimo e kit estão no painel da lista de Creators; o lucro, na ficha.
 */
export function PerformanceBoard({ brandName, monthLabel, ig, ugc, origin, initial, now, canEdit }: { brandName: string; monthLabel: string; ig: Ig; ugc: UgcCard[]; origin: OriginSummaryRow[]; initial: Tab; now: Date; canEdit: boolean }) {
  const [tab, setTab] = useState<Tab>(initial);
  const go = (t: Tab) => {
    setTab(t);
    try {
      const u = new URL(window.location.href);
      u.searchParams.set("aba", t);
      window.history.replaceState(null, "", u);
    } catch {}
  };
  const ok = ig.rows.filter((r) => r.status === "OK");
  const followers = ok.reduce((s, r) => s + (r.followers ?? 0), 0);
  const growth = ok.reduce((s, r) => s + (r.growth ?? 0), 0);
  const videos = ugc.reduce((s, c) => s + c.cycle.count, 0);
  const goal = ugc.reduce((s, c) => s + c.cycle.goal, 0);
  const late = ugc.filter((c) => c.late).length;
  const best = origin.find((r) => r.salesCents > 0) ?? null;

  const tiles: { id: Tab; label: string; value: React.ReactNode; hint: React.ReactNode; dot: string }[] = [
    {
      id: "instagram",
      label: "Instagram",
      value: ig.connected ? n(followers) : "—",
      hint: ig.connected ? `seguidores somados · ${growth >= 0 ? "+" : ""}${n(growth)} no mês` : "Instagram da marca não ligado",
      dot: "seg-info",
    },
    { id: "ugc", label: "UGC", value: ugc.length ? `${videos}/${goal}` : "—", hint: ugc.length ? (late ? `vídeos do ciclo · ${late} ${late === 1 ? "atrasada" : "atrasadas"}` : "vídeos do ciclo · todas no ritmo") : "nenhuma UGC ativa", dot: late ? "seg-bad" : "seg-good" },
    {
      id: "origem",
      label: "Origem",
      value: best ? <span className="money">{shortBRL(best.salesCents)}</span> : "—",
      hint: best ? `melhor canal: ${ORIGIN_LABEL[best.origin.kind]}${best.origin.hunter ? ` · ${best.origin.hunter.name.split(/\s+/)[0]}` : ""}` : `sem vendas em ${monthLabel}`,
      dot: "seg-warn",
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <section className="@container relative isolate overflow-hidden rounded-[32px] text-white shadow-[0_30px_60px_-34px_var(--brand)]">
        <div aria-hidden className="brand-art absolute inset-0 -z-10" />
        <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(80%_60%_at_50%_-20%,rgb(255_255_255/0.22),transparent_70%)]" />
        <div className="flex flex-col gap-5 p-5 md:p-7">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-white/70">{brandName}</p>
            <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Desempenho</h1>
            <p className="mt-1 max-w-2xl text-sm text-white/80">Instagram das creators, vídeos das UGC e de onde vêm as creators. As vendas e o ranking estão no Início.</p>
          </div>
          <div className="grid grid-cols-3 gap-2" data-tour="de-grupos">
            {tiles.map((t) => (
              <button key={t.id} type="button" aria-pressed={tab === t.id} onClick={() => go(t.id)} className={`seg-tile frost-tile flex min-w-0 flex-col items-start gap-0.5 rounded-2xl px-3 py-2.5 text-left @lg:px-4 @lg:py-3 text-stone-900 dark:text-white ${tab === t.id ? "is-on" : ""}`}>
                <span className="flex w-full items-center justify-between gap-2 text-[11px] font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-300"><span className="truncate">{t.label}</span><span className={`seg-dot ${t.dot}`} /></span>
                <span className="max-w-full truncate text-base font-semibold tabular-nums leading-tight @lg:text-2xl">{t.value}</span>
                <span className="hidden w-full truncate text-[11px] text-stone-500 @lg:block dark:text-stone-300">{t.hint}</span>
              </button>
            ))}
          </div>
        </div>
        <HelpTip id="de-grupos" className="absolute right-4 top-4" />
      </section>

      {tab === "instagram" ? <InstagramView data={ig} now={now} canEdit={canEdit} /> : tab === "ugc" ? <UgcView cards={ugc} canEdit={canEdit} /> : <OriginView rows={origin} monthLabel={monthLabel} />}
    </div>
  );
}
