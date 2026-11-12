import { ChevronLeft, ChevronRight, Download, Search as SearchIcon, TicketPercent } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { M } from "@/components/staff/dashboard-view";
import { HideValuesToggle } from "@/components/staff/hide-values";
import { GlassLight } from "@/components/ui/glass-light";
import { ui } from "@/components/ui/styles";
import { formatBRL, SALE_STATUS_LABEL, SALE_STATUSES, shortBRL } from "@/domain";
import { can } from "@/lib/auth/permissions";
import { currentActor } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { BIG_ORDER_FACTOR, listSales, salesReview, SALES_PAGE_SIZE, type ReviewKey } from "@/lib/sales/list";
import { DASH_PRESETS } from "@/lib/staff/dashboard";
import { staffContext } from "@/lib/staff/context";
import { filtersOf, salesPeriod, searchesAllTime, type Search } from "./filters";
import { SalesTable } from "./sales-table";

export const dynamic = "force-dynamic";

const dmy = (k: string) => `${k.slice(8, 10)}/${k.slice(5, 7)}`;
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");
const WEEK = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

const query = (sp: Search, change: Partial<Search>) => {
  const next = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...sp, ...change })) if (v) next.set(k, v);
  const s = next.toString();
  return s ? `?${s}` : "";
};

/** Quadros da conferência (D-SALESREVIEW): o que cada motivo pede à equipe. */
const REVIEW: { key: ReviewKey; label: string; hint: string; tone: string; act?: { href: string; label: string } }[] = [
  { key: "untyped", label: "Cupom sem tipo", hint: "a Ana classifica em Cupons", tone: "seg-bad", act: { href: "/admin/cupons", label: "Classificar" } },
  { key: "noowner", label: "Cupom sem dona", hint: "de creator, sem dona na data", tone: "seg-bad" },
  { key: "unknown", label: "Fora do sistema", hint: "código não cadastrado aqui", tone: "seg-warn" },
  { key: "big", label: "Pedidos grandes", hint: `${BIG_ORDER_FACTOR}× o ticket médio ou mais`, tone: "seg-info" },
  { key: "promo", label: "Cupom da marca", hint: "PROMO: não vai para creator", tone: "seg-info" },
  { key: "nocode", label: "Sem cupom", hint: "venda direta da loja", tone: "seg-info" },
];

// Vendas = conferência dos pedidos (D-SALESREVIEW, pedido do responsável em 2026-11-11): o painel fica no Início; aqui,
// cada pedido com a creator que levou (ou o motivo), os quadros do que conferir, o pedido no painel lateral e o CSV.
export default async function SalesPage({ searchParams }: { searchParams: Promise<Search> }) {
  const actor = await currentActor();
  if (!actor) redirect("/entrar?next=/admin/vendas");
  const { brand } = await staffContext(actor);
  if (!brand) return <p className={ui.muted}>Nenhuma marca.</p>;
  if (!can(actor.grants, "money.view", brand.id)) redirect("/conta");
  const sp = await searchParams;
  const { timezone } = await db().brand.findUniqueOrThrow({ where: { id: brand.id }, select: { timezone: true } });
  const period = salesPeriod(sp, timezone);
  const base = filtersOf(sp, period);
  const review = await salesReview(db(), brand.id, base);
  const motivo = (["untyped", "noowner", "unknown", "big", "promo", "nocode", "pending", "lost"] as const).find((m) => m === sp.motivo);
  const ids = motivo === "pending" ? review.pending.ids : motivo === "lost" ? review.lost.ids : motivo ? review.kinds[motivo].ids : undefined;
  const f = { ...base, ...(ids ? { ids } : {}) };
  const page = Math.max(1, Number.parseInt(sp.pagina ?? "1", 10) || 1);
  const r = await listSales(db(), brand.id, f, page);
  const pages = Math.max(1, Math.ceil(r.total / SALES_PAGE_SIZE));
  const allCount = SALE_STATUSES.reduce((s, k) => s + r.counts[k], 0);
  const keep = { periodo: sp.periodo ?? "", de: sp.de ?? "", ate: sp.ate ?? "" };
  const presetIdx = Math.max(0, DASH_PRESETS.findIndex((p) => p.id === period.preset));
  const toggle = (m: string) => `/admin/vendas${query(sp, { motivo: sp.motivo === m ? "" : m, pagina: "" })}#lista`;
  const heatMax = Math.max(1, ...review.heat.flat());
  const bestSlot = review.heat.flatMap((row, d) => row.map((n, h) => ({ d, h, n }))).sort((a, b) => b.n - a.n)[0];

  return (
    <GlassLight className="dash flex flex-col gap-4">
      <section className="@container relative isolate overflow-hidden rounded-[32px] text-white shadow-[0_30px_60px_-34px_var(--brand)]">
        <div aria-hidden className="brand-art absolute inset-0 -z-10" />
        <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(80%_60%_at_50%_-20%,rgb(255_255_255/0.22),transparent_70%)]" />
        <div className="flex flex-col gap-5 p-5 md:p-7">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-white/70">{brand.name}</p>
              <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Vendas</h1>
              <p className="mt-1 max-w-2xl text-sm text-white/80">
                Conferência dos pedidos de {dmy(period.from)} a {dmy(period.to)}: <strong className="text-white">{review.all.n}</strong> pedidos,{" "}
                <strong className="text-white">{review.withCreator.n}</strong> com creator ({pct(review.withCreator.n, review.all.n)}). Os números do período estão no Início.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <nav className="liquid-pill" style={{ "--n": DASH_PRESETS.length, "--i": period.preset ? presetIdx : -9 } as React.CSSProperties} aria-label="Período">
                <span aria-hidden className="drop" />
                {DASH_PRESETS.map((p) => <Link key={p.id} href={`/admin/vendas${query({ ...sp, de: "", ate: "" }, { periodo: p.id, pagina: "" })}`} aria-current={period.preset === p.id ? "true" : undefined}>{p.label}</Link>)}
              </nav>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 @2xl:grid-cols-4 @6xl:grid-cols-8">
            {[
              { key: "pending", label: "Aguardando", n: review.pending.n, sub: <M>{shortBRL(review.pending.cents)}</M>, hint: "pagamento", tone: "seg-warn" },
              { key: "lost", label: "Estornadas", n: review.lost.n, sub: <M>{shortBRL(review.lost.cents)}</M>, hint: review.lost.reversedCents ? "comissão devolvida" : "e canceladas", tone: "seg-bad" },
              ...REVIEW.map((x) => ({ key: x.key, label: x.label, n: review.kinds[x.key].n, sub: <M>{shortBRL(review.kinds[x.key].cents)}</M>, hint: x.hint, tone: x.tone })),
            ].map((t) => {
              const on = sp.motivo === t.key;
              return (
                <Link key={t.key} href={toggle(t.key)} aria-current={on ? "true" : undefined} className={`seg-tile frost-tile flex min-w-0 flex-col items-start gap-0.5 rounded-2xl px-3.5 py-3 text-stone-900 dark:text-white ${on ? "is-on" : ""}`}>
                  <span className="flex w-full items-center justify-between gap-2 text-[11px] font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-300"><span className="truncate">{t.label}</span><span className={`seg-dot ${t.tone}`} /></span>
                  <span className="flex items-baseline gap-1.5"><span className="text-2xl font-semibold tabular-nums leading-tight">{t.n}</span><span className="text-xs text-stone-500 dark:text-stone-300">{t.sub}</span></span>
                  <span className="w-full truncate text-[11px] text-stone-500 dark:text-stone-300">{t.hint}</span>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start">
        <section id="lista" className="glass flex scroll-mt-4 flex-col gap-3 overflow-hidden rounded-3xl !p-0">
          <div className="flex flex-col gap-3 p-4 pb-0 md:p-5 md:pb-0">
            <div className="-mx-1 flex gap-1 overflow-x-auto px-1">
              <Link href={`/admin/vendas${query(sp, { situacao: "", pagina: "" })}#lista`} className={`shrink-0 rounded-full px-3 py-1 text-sm ${f.status ? "text-stone-600 hover:bg-stone-500/10 dark:text-stone-300" : "bg-stone-900 text-white dark:bg-white dark:text-stone-900"}`}>
                Todas <span className="tabular-nums opacity-60">{allCount}</span>
              </Link>
              {SALE_STATUSES.map((s) => (
                <Link key={s} href={`/admin/vendas${query(sp, { situacao: s, pagina: "" })}#lista`} className={`shrink-0 rounded-full px-3 py-1 text-sm ${f.status === s ? "bg-stone-900 text-white dark:bg-white dark:text-stone-900" : "text-stone-600 hover:bg-stone-500/10 dark:text-stone-300"}`}>
                  {SALE_STATUS_LABEL[s]} <span className="tabular-nums opacity-60">{r.counts[s]}</span>
                </Link>
              ))}
            </div>
            <form className="flex flex-wrap items-center gap-2" role="search">
              {Object.entries(keep).map(([n, v]) => v && <input key={n} type="hidden" name={n} value={v} />)}
              {f.status && <input type="hidden" name="situacao" value={f.status} />}
              {sp.motivo && <input type="hidden" name="motivo" value={sp.motivo} />}
              <label className="relative min-w-0 flex-[1_1_14rem]">
                <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-stone-400" />
                <input name="q" defaultValue={f.q} placeholder="Pedido, cupom ou creator" aria-label="Buscar venda" className={`${ui.input} !rounded-full pl-10`} />
              </label>
              <select name="dona" defaultValue={sp.dona ?? ""} aria-label="Creator" className={`${ui.inputSm} !rounded-full`}>
                <option value="">Com e sem creator</option>
                <option value="creator">Só com creator</option>
                <option value="sem">Só sem creator</option>
              </select>
              <button className={ui.btnSm}>Buscar</button>
              <span className="ml-auto flex items-center gap-2">
                <HideValuesToggle />
                <a href={`/admin/vendas/csv${query(sp, { pagina: "" })}`} className={ui.ghostSm}><Download className="size-3.5" /> CSV</a>
              </span>
            </form>
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-stone-500">
              <span>
                <strong className="text-stone-800 dark:text-stone-100">{r.total}</strong> {r.total === 1 ? "pedido" : "pedidos"} · <M>{formatBRL(r.subtotalCents)}</M> em produtos (a base da comissão) ·{" "}
                {searchesAllTime(sp) ? "busca em todas as datas" : `feitos de ${dmy(period.from)} a ${dmy(period.to)}`}
                {sp.motivo && <> · <Link href={`/admin/vendas${query(sp, { motivo: "", pagina: "" })}#lista`} className="font-semibold text-brand hover:underline dark:text-brand-2">tirar o quadro</Link></>}
              </span>
              {pages > 1 && <Pager sp={sp} page={Math.min(page, pages)} pages={pages} />}
            </div>
          </div>
          {r.rows.length === 0 ? (
            <p className="p-10 text-center text-sm text-stone-500">Nenhum pedido com esses filtros.</p>
          ) : (
            <SalesTable rows={r.rows.map((o) => ({ ...o, createdAt: o.createdAt.toISOString(), paidAt: o.paidAt ? o.paidAt.toISOString() : null }))} />
          )}
          {pages > 1 && <div className="flex justify-center pb-4"><Pager sp={sp} page={Math.min(page, pages)} pages={pages} /></div>}
        </section>

        <aside className="flex min-w-0 flex-col gap-4">
          <section className="glass flex flex-col gap-3 rounded-3xl p-4">
            <h2 className={ui.h2}>Quando vendem (com creator)</h2>
            <div className="grid grid-cols-[1.75rem_repeat(24,minmax(0,1fr))] gap-[2px] text-[9px] text-stone-400">
              {review.heat.map((row, d) => (
                <div key={d} className="contents">
                  <span className="self-center">{WEEK[d]}</span>
                  {row.map((n, h) => (
                    <span key={h} title={`${WEEK[d]} ${h}h: ${n} pedido${n === 1 ? "" : "s"}`} className="aspect-square rounded-[3px]" style={{ background: n ? `color-mix(in srgb, var(--brand) ${Math.round(18 + (n / heatMax) * 82)}%, transparent)` : "rgb(120 113 108 / 0.08)" }} />
                  ))}
                </div>
              ))}
              <span />
              {Array.from({ length: 24 }, (_, h) => <span key={h} className="text-center">{h % 6 === 0 ? h : ""}</span>)}
            </div>
            <p className="text-xs text-stone-500">{bestSlot && bestSlot.n ? <>Pico: <strong className="text-stone-700 dark:text-stone-200">{WEEK[bestSlot.d]} às {bestSlot.h}h</strong>. Pedidos pagos com cupom de creator, pela hora do pagamento.</> : "Sem vendas com creator no período."}</p>
          </section>
          <section className="glass flex flex-col gap-3 rounded-3xl p-4">
            <h2 className={`${ui.h2} flex items-center gap-2`}><TicketPercent className="size-4" /> Cupons fora do sistema</h2>
            {review.unknownCodes.length === 0 ? (
              <p className="text-sm text-stone-500">Todos os cupons usados no período estão cadastrados.</p>
            ) : (
              <>
                <ul className="flex flex-col gap-1.5">
                  {review.unknownCodes.slice(0, 10).map((c) => (
                    <li key={c.code} className="flex items-center gap-2 text-sm">
                      <Link href={`/admin/vendas${query(sp, { q: c.code, motivo: "", pagina: "" })}#lista`} className="min-w-0 flex-1 truncate font-mono hover:underline">{c.code}</Link>
                      <span className="shrink-0 text-xs tabular-nums text-stone-500">{c.orders} ped. · <M>{shortBRL(c.cents)}</M></span>
                    </li>
                  ))}
                </ul>
                <p className="text-[11px] text-stone-500">Usados na loja, mas não existem no Creator Club. Se algum é de creator, cadastre em <Link href="/admin/cupons" className="font-semibold text-brand hover:underline dark:text-brand-2">Cupons</Link>; os pedidos passam a contar para ela.</p>
              </>
            )}
          </section>
          <section className="glass flex flex-col gap-1 rounded-3xl p-4 text-sm">
            <h2 className={ui.h2}>Ticket médio</h2>
            <p><strong className="tabular-nums"><M>{formatBRL(review.avgTicketCents)}</M></strong> <span className="text-xs text-stone-500">nos pedidos pagos do período; acima de <M>{formatBRL(review.avgTicketCents * BIG_ORDER_FACTOR)}</M> entra em &quot;Pedidos grandes&quot;.</span></p>
          </section>
        </aside>
      </div>
    </GlassLight>
  );
}

/** Paginação compacta: 10 vendas por página, "1 de 10" com setas; volta para a lista, sem subir a página. */
function Pager({ sp, page, pages }: { sp: Search; page: number; pages: number }) {
  const go = (n: number) => `/admin/vendas${query(sp, { pagina: n > 1 ? String(n) : "" })}#lista`;
  const arrow = "glass grid size-8 place-content-center rounded-full";
  return (
    <nav aria-label="Páginas" className="flex items-center gap-2 text-sm">
      {page > 1 ? <Link href={go(page - 1)} className={arrow} aria-label="Página anterior"><ChevronLeft className="size-4" /></Link> : <span className={`${arrow} opacity-30`}><ChevronLeft className="size-4" /></span>}
      <span className="tabular-nums text-stone-600 dark:text-stone-300">{page} de {pages}</span>
      {page < pages ? <Link href={go(page + 1)} className={arrow} aria-label="Próxima página"><ChevronRight className="size-4" /></Link> : <span className={`${arrow} opacity-30`}><ChevronRight className="size-4" /></span>}
    </nav>
  );
}
