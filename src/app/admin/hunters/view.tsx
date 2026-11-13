import { Link2, Target } from "lucide-react";
import Link from "next/link";
import { CopyButton } from "@/components/portal/copy-button";
import { WhatsAppIcon } from "@/components/ui/social-icons";
import { ui } from "@/components/ui/styles";
import { hunterCodeFrom, hunterUrl, shortBRL, whatsappLink } from "@/domain";
import type { HunterRow, hunterBoard } from "@/lib/onboarding/hunter-board";
import { Avatar, Sparkline } from "../creators/list-parts";
import { CreateLinkForm, PhoneEdit } from "./forms";

export const PERIODS = [
  { id: "30", label: "30 dias", days: 30 },
  { id: "90", label: "90 dias", days: 90 },
  { id: "tudo", label: "Tudo", days: null },
] as const;

const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");
const ext = { target: "_blank", rel: "noopener noreferrer" } as const;
const dmy = (d: Date) => d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" });

/** Funil do hunter: cliques → candidatas → aprovadas → venderam, em barras (cada etapa contra a anterior). */
function Funnel({ r }: { r: HunterRow }) {
  const steps = [
    { label: "Cliques", n: r.clicks, of: null as number | null },
    { label: "Candidatas", n: r.applications, of: r.clicks },
    { label: "Aprovadas", n: r.approved, of: r.applications },
    { label: "Venderam", n: r.selling, of: r.approved },
  ];
  const max = Math.max(1, r.clicks, r.applications);
  return (
    <div className="grid grid-cols-4 gap-2">
      {steps.map((s, i) => (
        <div key={s.label} className="flex min-w-0 flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-stone-500">{s.label}</span>
          <span className="text-lg font-semibold tabular-nums leading-none">{s.n}</span>
          <span className="h-1.5 overflow-hidden rounded-full bg-stone-500/10"><span className={`block h-full rounded-full ${i === 3 ? "bg-emerald-500" : "bg-brand/70 dark:bg-brand-2/70"}`} style={{ width: `${Math.max(s.n ? 4 : 0, (s.n / max) * 100)}%` }} /></span>
          <span className="text-[10px] text-stone-500">{s.of === null ? " " : `${pct(s.n, s.of)} da etapa`}</span>
        </div>
      ))}
    </div>
  );
}

/** Tela Hunters (D-HUNTERBOARD): faixa da marca, ranking com funil, parados e os links. */
export function HuntersView({ data, brandId, origin, period }: { data: Awaited<ReturnType<typeof hunterBoard>>; brandId: string; origin: string; period: string }) {
  const { rows, brand } = data;
  const tot = rows.reduce((t, r) => ({ clicks: t.clicks + r.clicks, apps: t.apps + r.applications, approved: t.approved + r.approved, sales: t.sales + r.salesCents }), { clicks: 0, apps: 0, approved: 0, sales: 0 });
  const idle = rows.filter((r) => r.idle);
  const idx = Math.max(0, PERIODS.findIndex((p) => p.id === period));
  return (
    <>
      <section className="@container relative isolate overflow-hidden rounded-[32px] text-white shadow-[0_30px_60px_-34px_var(--brand)]">
        <div aria-hidden className="brand-art absolute inset-0 -z-10" />
        <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(80%_60%_at_50%_-20%,rgb(255_255_255/0.22),transparent_70%)]" />
        <div className="flex flex-col gap-5 p-5 md:p-7">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-white/70">{brand.name}</p>
              <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight md:text-3xl"><Target className="size-6" /> Hunters</h1>
              <p className="mt-1 max-w-xl text-sm text-white/80">Cada hunter tem o próprio link: a candidata chega marcada com quem a trouxe. Para ter um hunter aqui, convide a pessoa em Equipe com o papel Hunter.</p>
            </div>
            <nav className="liquid-pill" style={{ "--n": PERIODS.length, "--i": idx } as React.CSSProperties} aria-label="Período">
              <span aria-hidden className="drop" />
              {PERIODS.map((p) => <Link key={p.id} href={p.id === "30" ? "/admin/hunters" : `/admin/hunters?periodo=${p.id}`} aria-current={p.id === period ? "true" : undefined}>{p.label}</Link>)}
            </nav>
          </div>
          <div className="grid grid-cols-2 gap-2 @3xl:grid-cols-4">
            {[
              { label: "Cliques nos links", value: String(tot.clicks), hint: `${rows.length} hunters` },
              { label: "Candidatas", value: String(tot.apps), hint: `${pct(tot.apps, tot.clicks)} dos cliques` },
              { label: "Aprovadas", value: String(tot.approved), hint: `${pct(tot.approved, tot.apps)} das candidatas` },
              { label: "Vendas das aprovadas", value: shortBRL(tot.sales), hint: "no período, pela data do pagamento" },
            ].map((t) => (
              <div key={t.label} className="frost-tile flex min-w-0 flex-col gap-0.5 rounded-2xl px-3.5 py-3 text-stone-900 dark:text-white">
                <span className="truncate text-[11px] font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-300">{t.label}</span>
                <span className="text-2xl font-semibold tabular-nums leading-tight">{t.value}</span>
                <span className="truncate text-[11px] text-stone-500 dark:text-stone-300">{t.hint}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start">
        <div className="@container">
          {rows.length === 0 ? (
            <section className="glass rounded-3xl p-10 text-center text-sm text-stone-500">Nenhum hunter ainda. <Link href="/admin/equipe" className={ui.link}>Convidar em Equipe</Link>.</section>
          ) : (
            <ol className="grid gap-3 @3xl:grid-cols-2">
              {rows.map((r, i) => {
                const wa = r.phone ? whatsappLink(r.phone, `Oi, ${r.name.split(" ")[0]}!`) : null;
                const url = r.link ? hunterUrl(origin, r.link.code, brand.slug) : null;
                return (
                  <li key={r.userId} className={`liquid-tile flex flex-col gap-3 rounded-3xl p-4 ${i === 0 && r.salesCents > 0 ? "ring-2 ring-amber-400/50" : ""}`}>
                    <div className="flex items-start gap-3">
                      <span className="relative">
                        <Avatar name={r.name} />
                        <span className="absolute -bottom-1 -right-1 grid size-5 place-content-center rounded-full bg-white text-[10px] font-bold text-stone-700 shadow dark:bg-stone-800 dark:text-stone-200">{i + 1}</span>
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-center gap-2">
                          <span className="truncate font-semibold">{r.name}</span>
                          {r.idle && <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-900 dark:text-amber-200">parado</span>}
                        </p>
                        <p className="truncate text-xs text-stone-500">{r.lastApplication ? `última candidata em ${dmy(r.lastApplication)}` : "nenhuma candidata ainda"}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold tabular-nums">{shortBRL(r.salesCents)}</p>
                        <p className="text-[10px] text-stone-500">em vendas</p>
                      </div>
                    </div>
                    <Funnel r={r} />
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-stone-500">Cliques · 12 semanas</span>
                      <Sparkline weeks={r.weeks} className="h-5 w-28" />
                    </div>
                    <div className="flex flex-wrap items-center gap-2 border-t border-stone-200/70 pt-3 dark:border-white/10">
                      {url ? (
                        <>
                          <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-stone-500">{url.replace(/^https?:\/\//, "")}</span>
                          <CopyButton value={url} label="Copiar link" />
                        </>
                      ) : (
                        <CreateLinkForm brandId={brandId} userId={r.userId} suggestion={hunterCodeFrom(r.name)} phone={r.phone} />
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-xs">
                      {wa && <a href={wa} {...ext} className="inline-flex items-center gap-1 font-semibold text-emerald-700 dark:text-emerald-400"><WhatsAppIcon className="size-3.5" />{r.phone}</a>}
                      {r.link && <PhoneEdit brandId={brandId} userId={r.userId} phone={r.phone} />}
                      <span className="ml-auto truncate text-stone-400">{r.email}</span>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>

        <aside className="flex min-w-0 flex-col gap-4">
          <section className="glass flex flex-col gap-3 rounded-3xl p-4">
            <h2 className={ui.h2}>Parados (30+ dias)</h2>
            {idle.length === 0 ? (
              <p className="text-sm text-emerald-700 dark:text-emerald-300">Todos trouxeram alguém nos últimos 30 dias. 🎉</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {idle.map((r) => {
                  const wa = r.phone ? whatsappLink(r.phone, `Oi, ${r.name.split(" ")[0]}! Tudo bem? Passando para saber como estão as indicações para a ${brand.name}. Seu link: ${r.link ? hunterUrl(origin, r.link.code, brand.slug) : ""}`) : null;
                  return (
                    <li key={r.userId} className="flex items-center gap-2 text-sm">
                      <span className="min-w-0 flex-1 truncate">{r.name}</span>
                      <span className="shrink-0 text-[11px] text-stone-500">{r.lastApplication ? dmy(r.lastApplication) : "nunca"}</span>
                      {wa ? <a href={wa} {...ext} aria-label={`Chamar ${r.name} no WhatsApp`} className="grid size-7 place-content-center rounded-full bg-emerald-600 text-white"><WhatsAppIcon className="size-3.5" /></a> : <span className="text-[10px] text-stone-400">sem tel.</span>}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
          <section className="glass flex flex-col gap-3 rounded-3xl p-4">
            <h2 className={`${ui.h2} flex items-center gap-2`}><Link2 className="size-4" /> Formulário sem hunter</h2>
            <div className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-stone-500">{`${origin}/inscricao/${brand.slug}`.replace(/^https?:\/\//, "")}</span>
              <CopyButton value={`${origin}/inscricao/${brand.slug}`} label="Copiar" />
            </div>
            <p className="text-[11px] text-stone-500">
              Para saber qual post, anúncio ou campanha trouxe a inscrição, acrescente uma etiqueta no fim do link, por exemplo{" "}
              <span className="font-mono">?origem=stories-outubro</span>. Ela aparece em Candidatas, na ficha e no Desempenho → Origem.
            </p>
          </section>
        </aside>
      </div>
    </>
  );
}
