"use client";

import { Check, Search, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
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
type Kind = "" | "creator" | "promo" | "idle";

const pct = (bps: number) => `${(bps / 100).toString().replace(".", ",")}%`;
/** "2026-11-05" → "05/11/26". */
const br = (d: string | null) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(2, 4)}` : "—");
const M = ({ children }: { children: React.ReactNode }) => <span className="money">{children}</span>;
const norm = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

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
 * Cupons (D-COUPONSIMPLE, responsável em 2026-11-19; antes D-COUPONTABS/D-COUPONBOARD): no topo, só quando existem, os
 * cupons a conferir em cartões (dona e comissão num clique; vários sem tipo como PROMO de uma vez). Embaixo, uma lista
 * só com todos os cupons conferidos (tipo, dona, comissão, desconto, pedidos, vendas de 30 dias, último uso e o selo
 * "parado"). Creators ativas sem cupom ficam na tela Creators (aviso + filtro "Sem cupom").
 */
export function CouponsBoard({ rows, creators, brandName, defaultRate, initialQuery = "" }: { rows: CouponRow[]; creators: Creator[]; brandName: string; defaultRate: number; initialQuery?: string }) {
  const router = useRouter();
  // Primeiro o que mais segura comissão, depois o mais usado; os nunca usados por último.
  const pending = rows.filter((r) => r.pending).sort((a, b) => b.waitingCommissionCents - a.waitingCommissionCents || b.orders - a.orders || a.code.localeCompare(b.code));
  const done = rows.filter((r) => !r.pending).sort((a, b) => b.sales30Cents - a.sales30Cents || b.orders - a.orders || a.code.localeCompare(b.code));
  const [q, setQ] = useState(initialQuery);
  const [kind, setKind] = useState<Kind>("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok?: string; error?: string } | null>(null);
  const match = (r: CouponRow) => !q || norm(r.code).includes(norm(q)) || (r.owner && norm(r.owner.name).includes(norm(q)));
  const list = done.filter(match).filter((r) => (kind === "creator" ? r.kind === "CREATOR" : kind === "promo" ? r.kind === "PROMO" : kind === "idle" ? r.idle : true));
  const pendingShown = pending.filter(match);
  const waiting = pending.reduce((s, r) => s + r.waitingCommissionCents, 0);
  const pickedOpen = [...picked].filter((id) => pending.some((r) => r.id === id && r.kind === null));
  const count = (k: Kind) => done.filter((r) => (k === "creator" ? r.kind === "CREATOR" : k === "promo" ? r.kind === "PROMO" : k === "idle" ? r.idle : true)).length;

  return (
    <div className="flex flex-col gap-4">
      <section className="relative isolate overflow-hidden rounded-[32px] text-white shadow-[0_30px_60px_-34px_var(--brand)]">
        <div aria-hidden className="brand-art absolute inset-0 -z-10" />
        <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(80%_60%_at_50%_-20%,rgb(255_255_255/0.22),transparent_70%)]" />
        <div className="flex flex-col gap-1 p-5 md:p-7">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-white/70">{brandName}</p>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Cupons</h1>
          <p className="max-w-2xl text-sm text-white/80">Tipo, dona e comissão de cada cupom. Cupom sem tipo ou com dona a confirmar deixa os pedidos dele sem creator; PROMO nunca leva pedido.</p>
        </div>
      </section>

      <section className="glass flex flex-wrap items-center gap-2 rounded-3xl p-3 md:p-4">
        <label className="relative min-w-0 flex-[1_1_14rem]">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-stone-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar cupom ou dona" aria-label="Buscar cupom ou dona" className={`${ui.input} !rounded-full pl-10`} />
        </label>
        <HelpTip id="cp-abas" />
      </section>

      {pending.length === 0 ? (
        <p className="flex items-center gap-2 rounded-2xl bg-emerald-500/10 px-4 py-2.5 text-sm text-emerald-900 dark:text-emerald-200"><Check className="size-4" /> Todos os cupons conferidos.</p>
      ) : (
        <section className="flex flex-col gap-3" data-tour="cp-conferir">
          <h2 className="flex flex-wrap items-baseline gap-x-2 px-1 text-base font-semibold">
            A conferir ({pending.length})
            {waiting > 0 && <span className="text-sm font-normal text-amber-800 dark:text-amber-200">≈ <M>{shortBRL(waiting)}</M> de comissão parada esperando</span>}
          </h2>
          {pickedOpen.length > 0 && (
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
          {pendingShown.length === 0 ? (
            <p className="glass rounded-3xl p-6 text-center text-sm text-stone-500">Nenhum cupom a conferir com essa busca.</p>
          ) : (
            <div className="@container">
              <ul className="grid gap-3 @2xl:grid-cols-2 @5xl:grid-cols-3">
                {pendingShown.map((r) => (
                  <PendingCard key={r.id} r={r} creators={creators} defaultRate={defaultRate} picked={picked.has(r.id)} onPick={() => setPicked((s) => { const n = new Set(s); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); return n; })} />
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      <section className="glass overflow-hidden rounded-3xl !p-0" data-tour="cp-abas">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-200/70 px-4 py-3 dark:border-white/10 md:px-5">
          <h2 className="text-base font-semibold">Todos os cupons <span className="font-normal text-stone-500">· {list.length}</span></h2>
          <nav className="flex flex-wrap gap-1" aria-label="Tipo">
            {([["", "Todos"], ["creator", "De creator"], ["promo", "Promocionais"], ["idle", "Parados"]] as const).map(([k, l]) => (
              <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)} className={`rounded-full px-3 py-1 text-xs font-medium ${kind === k ? "bg-brand text-white" : "bg-stone-500/10 text-stone-700 hover:bg-stone-500/15 dark:text-stone-200"}`}>
                {l} <span className="tabular-nums opacity-70">{count(k)}</span>
              </button>
            ))}
          </nav>
        </header>
        {list.length === 0 ? (
          <p className="p-10 text-center text-sm text-stone-500">Nenhum cupom encontrado.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm md:min-w-[820px]">
              <thead className="whitespace-nowrap text-left text-[11px] uppercase tracking-wide text-stone-500">
                <tr className="border-b border-stone-200/70 dark:border-white/10">
                  <th className="px-4 py-2 font-semibold">Cupom</th>
                  <th className="hidden px-3 py-2 font-semibold md:table-cell">Dona</th>
                  <th className="hidden px-3 py-2 text-right font-semibold md:table-cell">Comissão</th>
                  <th className="hidden px-3 py-2 text-right font-semibold md:table-cell">Desconto</th>
                  <th className="hidden px-3 py-2 text-right font-semibold md:table-cell">Pedidos</th>
                  <th className="hidden px-3 py-2 text-right font-semibold md:table-cell">Vendas 30 dias</th>
                  <th className="hidden px-4 py-2 text-right font-semibold md:table-cell">Último uso</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-200/70 dark:divide-white/10">
                {list.map((r) => (
                  <tr key={r.id} className="hover:bg-stone-500/5">
                    <td className="px-4 py-2.5">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span className="font-mono font-semibold">{r.code}</span>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${r.kind === "PROMO" ? "bg-sky-500/12 text-sky-800 dark:text-sky-200" : "bg-emerald-500/12 text-emerald-800 dark:text-emerald-200"}`}>{r.kind === "PROMO" ? "promocional" : "creator"}</span>
                        {r.idle && <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-900 dark:text-amber-200">parado</span>}
                        {r.kind === "PROMO" && (
                          <details className="relative">
                            <summary className="cursor-pointer list-none text-[11px] text-stone-500 hover:underline">trocar tipo</summary>
                            <div className="glass absolute left-0 z-10 mt-2 rounded-2xl p-3"><ClassifyForm couponId={r.id} kind={r.kind} /></div>
                          </details>
                        )}
                      </span>
                      {/* No celular, o resto embaixo do código. */}
                      <span className="mt-0.5 block text-xs text-stone-500 md:hidden">
                        {r.owner ? <Link href={`/admin/creators/${r.owner.creatorId}`} className="font-medium text-stone-700 hover:underline dark:text-stone-200">{r.owner.name}</Link> : "da loja"}
                        {r.rate ? ` · ${pct(r.rate.rateBps)}` : ""}{r.discountBps != null ? ` · ${pct(r.discountBps)} off` : ""} · <M>{shortBRL(r.sales30Cents)}</M> em 30 dias · {r.lastUse ? `último ${br(r.lastUse)}` : "nunca usado"}
                      </span>
                    </td>
                    <td className="hidden px-3 py-2.5 md:table-cell">{r.owner ? <Link href={`/admin/creators/${r.owner.creatorId}`} className="hover:underline">{r.owner.name}</Link> : <span className="text-stone-400">da loja</span>}</td>
                    <td className="hidden px-3 py-2.5 text-right tabular-nums md:table-cell">{r.rate ? pct(r.rate.rateBps) : "—"}</td>
                    <td className="hidden px-3 py-2.5 text-right tabular-nums text-stone-600 dark:text-stone-300 md:table-cell">{r.discountBps != null ? pct(r.discountBps) : "—"}</td>
                    <td className="hidden px-3 py-2.5 text-right tabular-nums md:table-cell">{r.orders}</td>
                    <td className="hidden px-3 py-2.5 text-right font-semibold tabular-nums md:table-cell"><M>{shortBRL(r.sales30Cents)}</M></td>
                    <td className={`hidden px-4 py-2.5 text-right text-xs tabular-nums md:table-cell ${r.idle ? "font-semibold text-amber-700 dark:text-amber-300" : "text-stone-500"}`}>{r.lastUse ? br(r.lastUse) : "nunca"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="border-t border-stone-200/70 px-4 py-3 text-xs text-stone-500 dark:border-white/10 md:px-5">Parado = cupom de creator sem uso há 60 dias ou mais. Creators ativas sem cupom aparecem em <Link href="/admin/creators?filtro=semcupom" className={ui.link}>Creators</Link>.</p>
      </section>
    </div>
  );
}
