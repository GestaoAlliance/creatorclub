import Link from "next/link";
import { ChevronRight, ListChecks, TrendingUp } from "lucide-react";
import { formatBRL, shortBRL } from "@/domain";
import type { ReleaseProgress } from "@/lib/commission/release";
import type { portalHomeExtras } from "@/lib/portal/motivation";
import { ShareButton } from "./share-button";

type Extras = Awaited<ReturnType<typeof portalHomeExtras>>;
const M = ({ children }: { children: React.ReactNode }) => <span className="money">{children}</span>;
const day = (d: Date) => d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" });

/** Anel do mínimo do contrato (quanto já acumulou para liberar a comissão no dia 1). */
function Ring({ pct, label }: { pct: number; label: string }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  return (
    <span className="relative grid shrink-0 place-content-center">
      <svg viewBox="0 0 64 64" className="size-24 -rotate-90" aria-hidden>
        <circle cx="32" cy="32" r={r} fill="none" stroke="rgb(255 255 255 / 0.22)" strokeWidth="7" />
        <circle cx="32" cy="32" r={r} fill="none" stroke="white" strokeWidth="7" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(1, pct / 100))} />
      </svg>
      <span className="absolute inset-0 grid place-content-center text-center leading-tight">
        <span className="text-lg font-semibold tabular-nums">{pct}%</span>
        <span className="text-[10px] uppercase tracking-wide text-white/80">{label}</span>
      </span>
    </span>
  );
}

/**
 * Faixa do Início (D-PORTALHOME): meta do mês (anel do mínimo), saldo para saque, vendas do mês e a faixa de posição;
 * compartilhar o cupom com 1 toque.
 */
export function HomeHero(p: {
  brandName: string;
  monthName: string;
  release: ReleaseProgress;
  availableCents: number;
  heldCents: number;
  salesCents: number;
  salesCount: number;
  band: string | null;
  share: { code: string; link: string; discountBps: number | null } | null;
  ugc: boolean;
}) {
  const r = p.release;
  const pct = r.minCents ? Math.min(100, Math.round((r.accumulatedCents / r.minCents) * 100)) : 0;
  const reached = r.minCents !== null && r.accumulatedCents >= r.minCents;
  const missing = r.minCents !== null ? Math.max(0, r.minCents - r.accumulatedCents) : 0;
  const shareText = p.share ? `Use meu cupom ${p.share.code} na ${p.brandName}${p.share.discountBps ? ` e ganhe ${(p.share.discountBps / 100).toLocaleString("pt-BR")}% de desconto` : ""}:` : "";
  return (
    <section className="@container relative isolate overflow-hidden rounded-[32px] text-white shadow-[0_30px_60px_-34px_var(--brand)]">
      <div aria-hidden className="brand-art absolute inset-0 -z-10" />
      <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(80%_60%_at_50%_-20%,rgb(255_255_255/0.22),transparent_70%)]" />
      <div className="flex flex-col gap-4 p-5 md:p-7">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-white/75">Seu mês de {p.monthName}</p>
        {!p.ugc && r.minCents !== null ? (
          <div data-tour="minimo-mes" className="flex items-center gap-4">
            <Ring pct={pct} label={reached ? "pronto" : "da meta"} />
            <div className="min-w-0">
              <p className="text-lg font-semibold leading-snug">{reached ? "Você bateu o mínimo!" : <>Faltam <M>{formatBRL(missing)}</M> {r.basis === "COMMISSION" ? "de comissão" : "em vendas"}</>}</p>
              <p className="text-sm text-white/80">{reached ? `Sua comissão libera em ${day(r.nextClosingAt)}.` : `para liberar a comissão no fechamento (${day(r.nextClosingAt)}).`}</p>
              <p className="mt-1 text-xs text-white/70"><M>{formatBRL(r.accumulatedCents)}</M> de <M>{formatBRL(r.minCents)}</M> acumulados</p>
            </div>
          </div>
        ) : (
          <div>
            <p className="text-3xl font-semibold tabular-nums"><M>{formatBRL(p.salesCents)}</M></p>
            <p className="text-sm text-white/80">em vendas com o seu cupom · {p.salesCount} {p.salesCount === 1 ? "pedido" : "pedidos"}</p>
          </div>
        )}
        {!p.ugc && (
          <div className="grid grid-cols-3 gap-2">
            {[
              { k: "saldo", label: "Para saque", v: p.availableCents },
              { k: "vendas-mes", label: "Vendas no mês", v: p.salesCents },
              { k: "a-liberar", label: "A liberar", v: p.heldCents },
            ].map((t) => (
              <div key={t.k} data-tour={t.k} className="frost-tile flex min-w-0 flex-col rounded-2xl px-3 py-2.5 text-stone-900 dark:text-white">
                <span className="truncate text-[10px] font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-300">{t.label}</span>
                <span className={`truncate text-base font-semibold tabular-nums @md:text-xl ${t.v < 0 ? "text-red-700 dark:text-red-400" : ""}`}><M>{shortBRL(t.v)}</M></span>
              </div>
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          {p.band && <span className="inline-flex items-center gap-1.5 rounded-full bg-white/18 px-3 py-1 text-xs font-semibold"><TrendingUp className="size-3.5" />{p.band}</span>}
          {p.share && <span className="ml-auto"><ShareButton text={shareText} url={p.share.link} /></span>}
        </div>
      </div>
    </section>
  );
}

/**
 * D-PORTALSIMPLE: uma pendência por vez (a primeira que falta), com atalho; some quando tudo está feito.
 */
export function NextSteps({ steps }: { steps: Extras["steps"] }) {
  const next = steps.find((s) => !s.done);
  if (!next) return null;
  const done = steps.filter((s) => s.done).length;
  return (
    <Link href={next.href} className="glass flex items-center gap-3 rounded-3xl p-4 hover:shadow-sm md:p-5">
      <span className="grid size-9 shrink-0 place-content-center rounded-2xl bg-brand/10 text-brand dark:bg-brand-2/15 dark:text-brand-2"><ListChecks className="size-4" /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-[11px] font-semibold uppercase tracking-wide text-stone-500">Próximo passo · {done} de {steps.length} feitos</span>
        <span className="block font-semibold">{next.label}</span>
      </span>
      <ChevronRight className="size-4 shrink-0 text-stone-400" />
    </Link>
  );
}
