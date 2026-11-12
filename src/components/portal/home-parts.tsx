import Link from "next/link";
import { Award, Check, ChevronRight, Lightbulb, ListChecks, Target, TrendingUp } from "lucide-react";
import { ProductThumb } from "@/components/ui/product-thumb";
import { formatBRL, kitNoun, shortBRL } from "@/domain";
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

/** Próximos passos: o que falta fazer, com atalho; some quando tudo está feito. */
export function NextSteps({ steps }: { steps: Extras["steps"] }) {
  if (!steps.length) return null;
  const done = steps.filter((s) => s.done).length;
  return (
    <section className="glass flex flex-col gap-2 rounded-3xl p-4 md:p-5">
      <h2 className="flex items-center justify-between gap-2 font-semibold">
        <span className="flex items-center gap-2"><ListChecks className="size-4" />Próximos passos</span>
        <span className="text-xs font-normal text-stone-500">{done} de {steps.length}</span>
      </h2>
      <ul className="flex flex-col gap-1.5">
        {steps.map((s) => (
          <li key={s.id}>
            {s.done ? (
              <span className="flex items-center gap-3 rounded-2xl px-3 py-2 text-sm text-stone-500 line-through"><span className="grid size-6 place-content-center rounded-full bg-emerald-500 text-white"><Check className="size-3.5" /></span>{s.label}</span>
            ) : (
              <Link href={s.href} className="liquid-tile flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium">
                <span className="size-6 shrink-0 rounded-full border-2 border-brand/50 dark:border-brand-2/60" />
                <span className="min-w-0 flex-1">{s.label}</span>
                <ChevronRight className="size-4 shrink-0 text-stone-400" />
              </Link>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Dica do dia, com os dados dela. */
export function DailyTip({ tip }: { tip: string }) {
  return (
    <section className="glass flex items-start gap-3 rounded-3xl p-4 md:p-5">
      <span className="grid size-9 shrink-0 place-content-center rounded-2xl bg-amber-400/20 text-amber-700 dark:text-amber-300"><Lightbulb className="size-4" /></span>
      <span className="min-w-0">
        <span className="block text-[11px] font-semibold uppercase tracking-wide text-stone-500">Dica do dia</span>
        <span className="block text-sm">{tip}</span>
      </span>
    </section>
  );
}

/** Próximo kit: quanto falta (faixa do mês ou meta da janela), com as fotos dos produtos que ela pode escolher. */
export function NextKit({ kit, photos, brandSlug, base }: { kit: Extras["kit"]; photos: Extras["kitPhotos"]; brandSlug: string; base: string }) {
  if (!kit) return null;
  let title: React.ReactNode;
  let goal = 0;
  let value = 0;
  if (kit.kind === "TIER") {
    value = kit.salesCents;
    goal = kit.next?.fromCents ?? kit.salesCents;
    title = kit.next ? <>Faltam <M>{formatBRL(kit.next.fromCents - kit.salesCents)}</M> para ganhar {kit.next.total - kit.total > 1 ? `mais ${kit.next.total - kit.total} ${kitNoun(brandSlug, 2)}` : `mais 1 ${kitNoun(brandSlug, 1)}`} este mês</> : <>Você chegou à faixa mais alta do mês 🎉</>;
  } else {
    value = kit.salesCents;
    goal = kit.goalCents;
    title = kit.granted ? <>Meta desta janela batida: seu produto está liberado 🎉</> : <>Faltam <M>{formatBRL(Math.max(0, kit.goalCents - kit.salesCents))}</M> até {kit.to.split("-").reverse().slice(0, 2).join("/")} para ganhar um {kitNoun(brandSlug, 1)}</>;
  }
  const pct = goal ? Math.min(100, Math.round((value / goal) * 100)) : 100;
  return (
    <Link href={`${base}/envios`} className="glass flex flex-col gap-3 rounded-3xl p-4 md:p-5">
      <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-stone-500"><Target className="size-3.5" />Próximo kit</span>
      <span className="font-semibold leading-snug">{title}</span>
      <span className="h-2 overflow-hidden rounded-full bg-stone-300/60 dark:bg-white/10"><span className="block h-full rounded-full bg-brand dark:bg-brand-2" style={{ width: `${pct}%` }} /></span>
      {photos.length > 0 && (
        <span className="flex items-center gap-2">
          <span className="flex -space-x-2">{photos.map((ph) => <span key={ph.title} className="rounded-xl ring-2 ring-white dark:ring-stone-900"><ProductThumb src={ph.image} title={ph.title} size="sm" /></span>)}</span>
          <span className="text-xs text-stone-500">você escolhe entre estes e outros produtos</span>
        </span>
      )}
    </Link>
  );
}

/** Conquistas: quatro selos; os que faltam aparecem apagados. */
export function Achievements({ list }: { list: Extras["achievements"] }) {
  return (
    <section className="glass flex flex-col gap-3 rounded-3xl p-4 md:p-5">
      <h2 className="flex items-center justify-between gap-2 font-semibold">
        <span className="flex items-center gap-2"><Award className="size-4" />Conquistas</span>
        <span className="text-xs font-normal text-stone-500">{list.filter((a) => a.done).length} de {list.length}</span>
      </h2>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {list.map((a) => (
          <li key={a.id} className={`flex flex-col items-center gap-1.5 rounded-2xl px-2 py-3 text-center text-xs font-medium ${a.done ? "liquid-tile" : "bg-stone-500/8 text-stone-400"}`}>
            <span className={`grid size-10 place-content-center rounded-full ${a.done ? "bg-brand text-white shadow dark:bg-brand-2 dark:text-stone-900" : "bg-stone-300/60 dark:bg-white/10"}`}><Award className="size-5" /></span>
            {a.label}
          </li>
        ))}
      </ul>
    </section>
  );
}
