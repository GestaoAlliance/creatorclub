"use client";

import { Search, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { HelpTip } from "@/components/ui/tour";
import { ui } from "@/components/ui/styles";
import { shortBRL } from "@/domain";
import { ClassifyForm, OwnerQuick, RateForm } from "./forms";
import { promoManyAction } from "./actions";

export type CouponRow = {
  id: string;
  code: string;
  kind: "CREATOR" | "PROMO" | null;
  discountBps: number | null;
  owner: { creatorId: string; name: string; confirmed: boolean } | null;
  rate: { policyId: string; rateBps: number; confirmed: boolean } | null;
  orders: number;
  salesCents: number;
  sales30Cents: number;
  firstUse: string | null;
  lastUse: string | null;
  idle: boolean;
  pending: boolean;
  waitingCommissionCents: number;
  suggestion: { creatorId: string; name: string } | null;
};
type Creator = { id: string; name: string; status: string; detail: string };
type Tab = "pending" | "creator" | "promo" | "idle" | "nocoupon";

const pct = (bps: number) => `${(bps / 100).toString().replace(".", ",")}%`;
/** "2026-11-05" → "05/11/26". */
const br = (d: string | null) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(2, 4)}` : "—");
const M = ({ children }: { children: React.ReactNode }) => <span className="money">{children}</span>;
const norm = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

/** Anel do progresso da conferência (creators ativas com cupom, dona e comissão confirmados). */
function Ring({ done, total }: { done: number; total: number }) {
  const p = total ? done / total : 1;
  const r = 26;
  const c = 2 * Math.PI * r;
  return (
    <span className="relative grid place-content-center">
      <svg viewBox="0 0 64 64" className="size-20 -rotate-90" aria-hidden>
        <circle cx="32" cy="32" r={r} fill="none" stroke="rgb(255 255 255 / 0.2)" strokeWidth="7" />
        <circle cx="32" cy="32" r={r} fill="none" stroke="white" strokeWidth="7" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - p)} />
      </svg>
      <span className="absolute inset-0 grid place-content-center text-sm font-semibold tabular-nums">{Math.round(p * 100)}%</span>
    </span>
  );
}

/** Cartão de um cupom a conferir: contexto (pedidos, vendas, usos, comissão parada) e a ação que falta. */
function PendingCard({ r, creators, picked, onPick, defaultRate }: { r: CouponRow; creators: Creator[]; picked: boolean; onPick: () => void; defaultRate: number }) {
  const needsOwner = r.kind !== "PROMO" && !r.owner?.confirmed;
  const rateBps = r.rate?.rateBps ?? defaultRate;
  return (
    <li className={`liquid-tile flex flex-col gap-3 rounded-3xl p-4 ${picked ? "ring-2 ring-brand/50" : ""}`}>
      <div className="flex items-start justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2">
          {r.kind === null && <input type="checkbox" checked={picked} onChange={onPick} aria-label={`Marcar ${r.code}`} className="size-4 accent-[var(--brand)]" />}
          <span className="truncate font-mono text-lg font-semibold">{r.code}</span>
        </span>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${r.kind === null ? "bg-red-500/12 text-red-800 dark:text-red-300" : "bg-amber-500/15 text-amber-900 dark:text-amber-200"}`}>
          {r.kind === null ? "sem tipo" : !r.owner?.confirmed ? "dona a confirmar" : "comissão a confirmar"}
        </span>
      </div>
      <dl className="grid grid-cols-3 gap-2 text-xs">
        <div><dt className="text-stone-500">Pedidos</dt><dd className="font-semibold tabular-nums">{r.orders}</dd></div>
        <div><dt className="text-stone-500">Vendas</dt><dd className="font-semibold tabular-nums"><M>{shortBRL(r.salesCents)}</M></dd></div>
        <div><dt className="text-stone-500">Usado</dt><dd className="tabular-nums">{r.firstUse ? `${br(r.firstUse)} → ${br(r.lastUse)}` : "nunca"}</dd></div>
      </dl>
      {r.waitingCommissionCents > 0 && (
        <p className="rounded-xl bg-amber-500/10 px-3 py-1.5 text-xs text-amber-900 dark:text-amber-200">≈ <strong><M>{shortBRL(r.waitingCommissionCents)}</M></strong> de comissão parada esperando esta conferência</p>
      )}
      {r.discountBps != null && <p className="text-[11px] text-stone-500">Desconto do cliente: {pct(r.discountBps)}</p>}
      <div className="border-t border-stone-200/70 pt-3 dark:border-white/10">
        {needsOwner ? (
          <div className="flex flex-col gap-2">
            <OwnerQuick
              couponId={r.id}
              suggestion={r.suggestion}
              current={r.owner ? { creatorId: r.owner.creatorId, name: r.owner.name } : null}
              needsSince={!r.owner}
              since={r.firstUse}
              ratePct={(rateBps / 100).toString().replace(".", ",")}
              rateLocked={r.rate?.confirmed ?? false}
              creators={creators}
            />
            {r.kind === null && (
              <div className="flex items-center gap-2 text-xs text-stone-500">
                ou é da loja: <ClassifyForm couponId={r.id} kind={r.kind} only="PROMO" />
              </div>
            )}
          </div>
        ) : r.rate && !r.rate.confirmed ? (
          <div className="flex flex-col gap-1">
            <span className="text-xs text-stone-500">Dona: <Link href={`/admin/creators/${r.owner!.creatorId}`} className="font-medium hover:underline">{r.owner!.name}</Link></span>
            <RateForm policyId={r.rate.policyId} rateBps={r.rate.rateBps} />
          </div>
        ) : (
          <span className="text-xs text-stone-500">
            Dona: <Link href={`/admin/creators/${r.owner!.creatorId}`} className="font-medium hover:underline">{r.owner!.name}</Link>. Sem comissão cadastrada:{" "}
            <Link href={`/admin/creators/${r.owner!.creatorId}#contrato`} className="font-medium text-brand hover:underline">defina na ficha</Link>.
          </span>
        )}
      </div>
    </li>
  );
}

/**
 * Cupons (D-COUPONTABS; D-COUPONBOARD): faixa da marca com o progresso da conferência e os quadros (a conferir, de
 * creator, promocionais, parados, creators sem cupom). A conferir em cartões com contexto, sugestão de dona e dona +
 * comissão num clique; vários sem tipo como PROMO de uma vez; listas com vendas, último uso, desconto e comissão.
 */
export function CouponsBoard({ rows, creators, progress, withoutCoupon, brandName, defaultRate }: { rows: CouponRow[]; creators: Creator[]; progress: { activeCreators: number; confirmed: number }; withoutCoupon: { id: string; name: string }[]; brandName: string; defaultRate: number }) {
  const router = useRouter();
  // Primeiro o que mais segura comissão, depois o mais usado; os nunca usados por último.
  const pending = rows.filter((r) => r.pending).sort((a, b) => b.waitingCommissionCents - a.waitingCommissionCents || b.orders - a.orders || a.code.localeCompare(b.code));
  const creatorRows = rows.filter((r) => r.kind === "CREATOR" && !r.pending).sort((a, b) => b.sales30Cents - a.sales30Cents || b.salesCents - a.salesCents);
  const promoRows = rows.filter((r) => r.kind === "PROMO").sort((a, b) => b.orders - a.orders);
  const idleRows = creatorRows.filter((r) => r.idle);
  const [tab, setTab] = useState<Tab>(pending.length > 0 ? "pending" : "creator");
  const [q, setQ] = useState("");
  const [rate, setRate] = useState<number | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok?: string; error?: string } | null>(null);
  const match = (r: CouponRow) => !q || norm(r.code).includes(norm(q)) || (r.owner && norm(r.owner.name).includes(norm(q)));
  const base = tab === "pending" ? pending : tab === "creator" ? creatorRows : tab === "promo" ? promoRows : tab === "idle" ? idleRows : [];
  const list = base.filter(match).filter((r) => rate === null || r.rate?.rateBps === rate);
  const rates = useMemo(() => [...new Set(creatorRows.map((r) => r.rate?.rateBps).filter((x): x is number => x != null))].sort((a, b) => a - b), [creatorRows]);
  const waiting = pending.reduce((s, r) => s + r.waitingCommissionCents, 0);
  const pickedOpen = [...picked].filter((id) => pending.some((r) => r.id === id && r.kind === null));

  const tiles: { id: Tab; label: string; n: number; hint: React.ReactNode; dot: string }[] = [
    { id: "pending", label: "A conferir", n: pending.length, hint: waiting ? <>≈ <M>{shortBRL(waiting)}</M> de comissão parada</> : "nada parado", dot: "seg-bad" },
    { id: "creator", label: "De creator", n: creatorRows.length, hint: <><M>{shortBRL(creatorRows.reduce((s, r) => s + r.sales30Cents, 0))}</M> em 30 dias</>, dot: "seg-good" },
    { id: "promo", label: "Promocionais", n: promoRows.length, hint: `${promoRows.reduce((s, r) => s + r.orders, 0)} pedidos`, dot: "seg-info" },
    { id: "idle", label: "Parados", n: idleRows.length, hint: "sem uso há 60+ dias", dot: "seg-warn" },
    { id: "nocoupon", label: "Sem cupom", n: withoutCoupon.length, hint: "creators ativas", dot: "seg-warn" },
  ];

  return (
    <div className="flex flex-col gap-4">
      <section className="@container relative isolate overflow-hidden rounded-[32px] text-white shadow-[0_30px_60px_-34px_var(--brand)]">
        <div aria-hidden className="brand-art absolute inset-0 -z-10" />
        <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(80%_60%_at_50%_-20%,rgb(255_255_255/0.22),transparent_70%)]" />
        <div className="flex flex-col gap-5 p-5 md:p-7">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-white/70">{brandName}</p>
              <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Cupons</h1>
              <p className="mt-1 max-w-xl text-sm text-white/80">Tipo, dona e comissão de cada cupom. Cupom sem tipo ou com dona a confirmar deixa os pedidos dele sem creator; PROMO nunca leva pedido.</p>
            </div>
            <div className="flex items-center gap-3" data-tour="cp-resumo">
              <Ring done={progress.confirmed} total={progress.activeCreators} />
              <div className="text-sm leading-tight">
                <p className="text-2xl font-semibold tabular-nums">{progress.confirmed}<span className="text-base text-white/70">/{progress.activeCreators}</span></p>
                <p className="text-white/80">creators conferidas</p>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 @2xl:grid-cols-3 @5xl:grid-cols-5" data-tour="cp-abas">
            {tiles.map((t) => (
              <button key={t.id} type="button" aria-pressed={tab === t.id} onClick={() => { setTab(t.id); setRate(null); }} className={`seg-tile frost-tile flex min-w-0 flex-col items-start gap-0.5 rounded-2xl px-3.5 py-3 text-left text-stone-900 dark:text-white ${tab === t.id ? "is-on" : ""}`}>
                <span className="flex w-full items-center justify-between gap-2 text-[11px] font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-300"><span className="truncate">{t.label}</span><span className={`seg-dot ${t.dot}`} /></span>
                <span className="text-2xl font-semibold tabular-nums leading-tight">{t.n}</span>
                <span className="w-full truncate text-[11px] text-stone-500 dark:text-stone-300">{t.hint}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      {tab !== "nocoupon" && (
        <section className="glass flex flex-wrap items-center gap-2 rounded-3xl p-3 md:p-4">
          <label className="relative min-w-0 flex-[1_1_14rem]">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-stone-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar cupom ou dona" aria-label="Buscar cupom ou dona" className={`${ui.input} !rounded-full pl-10`} />
          </label>
          {(tab === "creator" || tab === "idle") && rates.length > 1 && (
            <span className="flex flex-wrap items-center gap-1">
              <span className="text-xs text-stone-500">comissão:</span>
              {rates.map((x) => (
                <button key={x} type="button" onClick={() => setRate(rate === x ? null : x)} className={`rounded-full px-2.5 py-1 text-xs ${rate === x ? "bg-brand text-white" : "bg-stone-500/10"}`}>{pct(x)}</button>
              ))}
            </span>
          )}
          <span className="ml-auto text-xs text-stone-500"><strong className="text-stone-800 dark:text-stone-100">{list.length}</strong> cupons</span>
          <HelpTip id="cp-abas" />
        </section>
      )}

      {tab === "pending" && pickedOpen.length > 0 && (
        <div className="bulk-bar sticky top-3 z-20 flex flex-wrap items-center gap-2 rounded-3xl px-4 py-3 text-sm">
          <strong>{pickedOpen.length}</strong> sem tipo marcados
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              const r = await promoManyAction(pickedOpen);
              setBusy(false);
              setMsg(r);
              if (r.ok) {
                setPicked(new Set());
                router.refresh();
              }
            }}
            className={ui.btnSm}
          >
            {busy ? "Salvando…" : `Marcar ${pickedOpen.length} como PROMO`}
          </button>
          <button type="button" onClick={() => setPicked(new Set())} className={ui.ghostSm}><X className="size-3.5" /> Desmarcar</button>
        </div>
      )}
      {msg && <p role={msg.error ? "alert" : "status"} className={`text-sm ${msg.error ? "text-red-700" : "text-emerald-700 dark:text-emerald-300"}`}>{msg.error ?? msg.ok}</p>}

      {tab === "pending" && (
        list.length === 0 ? (
          <section className="glass rounded-3xl p-10 text-center text-sm text-stone-500">{q ? "Nenhum cupom encontrado." : "Nada a conferir. Tudo certo por aqui. 🎉"}</section>
        ) : (
          <div className="@container">
            <ul data-tour="cp-conferir" className="grid gap-3 @2xl:grid-cols-2 @5xl:grid-cols-3">
              {list.map((r) => (
                <PendingCard key={r.id} r={r} creators={creators} defaultRate={defaultRate} picked={picked.has(r.id)} onPick={() => setPicked((s) => { const n = new Set(s); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); return n; })} />
              ))}
            </ul>
          </div>
        )
      )}

      {(tab === "creator" || tab === "idle") && (
        <section className="@container glass overflow-hidden rounded-3xl !p-0">
          {list.length === 0 ? (
            <p className="p-10 text-center text-sm text-stone-500">{tab === "idle" ? "Nenhum cupom de creator parado. 🎉" : "Nenhum cupom encontrado."}</p>
          ) : (
            <ul className="flex flex-col divide-y divide-stone-200/70 dark:divide-white/10">
              <li className="hidden grid-cols-[8rem_minmax(0,1fr)_4.5rem_4.5rem_4rem_6rem_5.5rem] gap-3 px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-stone-500 @3xl:grid">
                <span>Cupom</span><span>Dona</span><span className="text-right">Comissão</span><span className="text-right">Desconto</span><span className="text-right">Pedidos</span><span className="text-right">30 dias</span><span className="text-right">Último uso</span>
              </li>
              {list.map((r) => (
                <li key={r.id} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-0.5 px-4 py-2.5 text-sm @3xl:grid-cols-[8rem_minmax(0,1fr)_4.5rem_4.5rem_4rem_6rem_5.5rem] @3xl:px-5">
                  <span className="font-mono font-semibold">{r.code}</span>
                  <span className="text-right font-semibold tabular-nums @3xl:hidden"><M>{shortBRL(r.sales30Cents)}</M></span>
                  <Link href={`/admin/creators/${r.owner!.creatorId}`} className="min-w-0 truncate text-stone-600 hover:underline dark:text-stone-300 @3xl:text-stone-900 @3xl:dark:text-stone-100">{r.owner!.name}</Link>
                  <span className="text-right text-xs text-stone-500 @3xl:hidden">{pct(r.rate!.rateBps)}{r.discountBps != null ? ` · ${pct(r.discountBps)} off` : ""} · {r.lastUse ? br(r.lastUse) : "nunca usado"}{r.idle && " · parado"}</span>
                  <span className="hidden text-right font-semibold tabular-nums @3xl:block">{pct(r.rate!.rateBps)}</span>
                  <span className="hidden text-right tabular-nums text-stone-600 @3xl:block dark:text-stone-300">{r.discountBps != null ? pct(r.discountBps) : "—"}</span>
                  <span className="hidden text-right tabular-nums @3xl:block">{r.orders}</span>
                  <span className="hidden text-right font-semibold tabular-nums @3xl:block"><M>{shortBRL(r.sales30Cents)}</M></span>
                  <span className={`hidden text-right text-xs tabular-nums @3xl:block ${r.idle ? "font-semibold text-amber-700 dark:text-amber-300" : "text-stone-500"}`}>{r.lastUse ? br(r.lastUse) : "nunca"}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {tab === "promo" && (
        <div className="@container">
          {list.length === 0 ? (
            <section className="glass rounded-3xl p-10 text-center text-sm text-stone-500">Nenhum cupom encontrado.</section>
          ) : (
            <ul className="grid gap-2 @xl:grid-cols-2 @4xl:grid-cols-3">
              {list.map((r) => (
                <li key={r.id} className="liquid-tile flex items-center justify-between gap-2 rounded-2xl px-4 py-3">
                  <span className="min-w-0">
                    <span className="block truncate font-mono text-sm font-semibold">{r.code}</span>
                    <span className="text-[11px] text-stone-500">{r.orders} pedidos · <M>{shortBRL(r.salesCents)}</M>{r.discountBps != null ? ` · ${pct(r.discountBps)} off` : ""} · último {br(r.lastUse)}</span>
                  </span>
                  <details className="relative">
                    <summary className="cursor-pointer list-none text-xs text-stone-500 hover:underline">Trocar tipo</summary>
                    <div className="glass absolute right-0 z-10 mt-2 rounded-2xl p-3">
                      <ClassifyForm couponId={r.id} kind={r.kind} />
                    </div>
                  </details>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {tab === "nocoupon" && (
        <section className="glass flex flex-col gap-3 rounded-3xl p-4">
          {withoutCoupon.length === 0 ? (
            <p className="p-6 text-center text-sm text-stone-500">Todas as creators ativas têm cupom de creator. 🎉</p>
          ) : (
            <>
              <p className="text-sm text-stone-600 dark:text-stone-300">Creators ativas sem cupom de creator: as vendas delas não aparecem para ninguém. Abra a ficha e crie o cupom (aba Resumo → Criar outro cupom).</p>
              <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {withoutCoupon.map((c) => (
                  <li key={c.id}><Link href={`/admin/creators/${c.id}`} className="liquid-tile block truncate rounded-2xl px-4 py-2.5 text-sm font-medium hover:underline">{c.name}</Link></li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}
    </div>
  );
}
