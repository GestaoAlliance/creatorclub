"use client";

import { ChevronDown, ChevronRight, ChevronUp, ExternalLink, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { formatBRL, SALE_STATUS_LABEL, type SaleStatus } from "@/domain";
import type { SaleRow } from "@/lib/sales/list";
import { orderDetailAction } from "./actions";

/** Valor que some com "esconder valores" (mesma classe do Início). */
const M = ({ children }: { children: React.ReactNode }) => <span className="money">{children}</span>;

type Row = Omit<SaleRow, "createdAt" | "paidAt"> & { createdAt: string; paidAt: string | null };
type Detail = NonNullable<Awaited<ReturnType<typeof orderDetailAction>>>;

const STATUS: Record<SaleStatus, string> = {
  PAID: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300",
  PENDING: "bg-amber-500/15 text-amber-900 dark:text-amber-200",
  REFUNDED: "bg-red-500/12 text-red-800 dark:text-red-300",
  CANCELLED: "bg-stone-500/15 text-stone-700 dark:text-stone-300",
  TEST: "bg-sky-500/15 text-sky-800 dark:text-sky-300",
};
const when = (d: string | Date) => new Date(d).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
const short = (d: string) => new Date(d).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).replace(",", "");
const pct = (bps: number) => `${(bps / 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
const LEDGER: Record<string, string> = { COMMISSION: "Comissão", REVERSAL: "Estorno da comissão", ADJUSTMENT: "Ajuste", PRIZE: "Prêmio", OPENING_BALANCE: "Abertura" };

/** Painel do pedido (D-SALESREVIEW): produtos, cupons, por que foi (ou não) para a creator, taxa, comissão e datas. */
function OrderPanel({ id, onClose, onPrev, onNext }: { id: string; onClose: () => void; onPrev: (() => void) | null; onNext: (() => void) | null }) {
  const [d, setD] = useState<Detail | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    setD(undefined);
    void orderDetailAction(id).then((x) => live && setD(x));
    return () => {
      live = false;
    };
  }, [id]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input,textarea,select")) return;
      if (e.key === "Escape") onClose();
      else if ((e.key === "ArrowDown" || e.key === "j") && onNext) { e.preventDefault(); onNext(); }
      else if ((e.key === "ArrowUp" || e.key === "k") && onPrev) { e.preventDefault(); onPrev(); }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose, onNext, onPrev]);
  return (
    <>
      <button type="button" aria-label="Fechar" onClick={onClose} className="fixed inset-0 z-40 bg-stone-950/25 backdrop-blur-[2px] lg:hidden" />
      <aside aria-label="Pedido" className="peek-panel glass fixed inset-x-2 bottom-2 top-16 z-50 flex flex-col overflow-hidden rounded-3xl lg:inset-x-auto lg:bottom-4 lg:right-4 lg:top-4 lg:w-[420px]">
        <header className="relative overflow-hidden px-5 pb-4 pt-5 text-white">
          <div aria-hidden className="brand-art absolute inset-0 -z-10" />
          <div className="flex items-start justify-between gap-2">
            <div className="flex gap-1">
              <button type="button" disabled={!onPrev} onClick={() => onPrev?.()} aria-label="Pedido anterior (↑)" className="peek-btn"><ChevronUp className="size-4" /></button>
              <button type="button" disabled={!onNext} onClick={() => onNext?.()} aria-label="Próximo pedido (↓)" className="peek-btn"><ChevronDown className="size-4" /></button>
            </div>
            <button type="button" onClick={onClose} aria-label="Fechar (Esc)" className="peek-btn"><X className="size-4" /></button>
          </div>
          {d && (
            <div className="mt-3">
              <p className="font-mono text-2xl font-semibold">{d.name}</p>
              <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-white/85">
                <span className="rounded-full bg-white/90 px-2 py-0.5 font-semibold text-stone-900">{SALE_STATUS_LABEL[d.status]}</span>
                feito em {when(d.createdAt)}
              </p>
              {d.shopifyUrl && <a href={d.shopifyUrl} target="_blank" rel="noopener noreferrer" className="peek-chip mt-3">Abrir na Shopify <ExternalLink className="size-3.5" /></a>}
            </div>
          )}
        </header>
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-5 py-4 text-sm">
          {d === undefined && <p className="text-stone-400">Carregando…</p>}
          {d === null && <p className="text-stone-500">Não deu para abrir este pedido.</p>}
          {d && (
            <>
              <section className={`rounded-2xl p-3 ${d.creatorId ? "bg-emerald-500/10" : "bg-amber-500/10"}`}>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-500">Creator</p>
                {d.creatorId ? (
                  <p className="mt-0.5"><Link href={`/admin/creators/${d.creatorId}`} className="font-semibold hover:underline">{d.creatorName}</Link> · {d.reason}</p>
                ) : (
                  <p className="mt-0.5 font-medium">Nenhuma: {d.reason}</p>
                )}
                {d.codes.length > 0 && (
                  <p className="mt-2 flex flex-wrap gap-1">
                    {d.codes.map((c) => <Link key={c} href={`/admin/cupons?q=${encodeURIComponent(c)}`} className="rounded-md bg-white/70 px-1.5 py-0.5 font-mono text-xs hover:underline dark:bg-white/10">{c}</Link>)}
                  </p>
                )}
                {d.decidedAt && <p className="mt-1 text-[11px] text-stone-500">Decidido em {when(d.decidedAt)} pela lista de códigos do pedido{d.evidence.length ? `: ${d.evidence.join(", ")}` : ""}.</p>}
              </section>
              <section className="grid grid-cols-2 gap-2">
                <div className="liquid-tile rounded-2xl px-3 py-2.5">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-500">Produtos</p>
                  <p className="font-semibold tabular-nums"><M>{formatBRL(d.subtotalCents)}</M></p>
                  <p className="text-[11px] text-stone-500">total <M>{formatBRL(d.totalCents)}</M></p>
                </div>
                <div className="liquid-tile rounded-2xl px-3 py-2.5">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-500">Comissão</p>
                  <p className="font-semibold tabular-nums">{d.commissionCents === null ? "—" : <M>{formatBRL(d.commissionCents)}</M>}</p>
                  <p className="text-[11px] text-stone-500">{d.rateBps !== null ? `taxa ${pct(d.rateBps)} (a do pagamento)` : d.creatorId ? "taxa no pagamento" : "sem creator"}</p>
                </div>
              </section>
              {d.lines.length > 0 && (
                <section>
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-stone-500">Itens</p>
                  <ul className="flex flex-col divide-y divide-stone-200/70 dark:divide-white/10">
                    {d.lines.map((l, i) => (
                      <li key={i} className="flex items-baseline justify-between gap-3 py-1.5">
                        <span className="min-w-0"><span className="text-stone-500 tabular-nums">{l.quantity}×</span> {l.title}</span>
                        <span className="shrink-0 tabular-nums">{l.discountedTotalCents ? <M>{formatBRL(l.discountedTotalCents)}</M> : <span className="text-[11px] text-stone-500">brinde</span>}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              <section>
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-stone-500">Linha do tempo</p>
                <ol className="flex flex-col gap-1.5 border-l border-stone-200 pl-3 dark:border-white/10">
                  <li>Pedido feito · {when(d.createdAt)}</li>
                  {d.paidAt && <li>Pago · {when(d.paidAt)}</li>}
                  {d.ledger.map((e, i) => <li key={i}>{LEDGER[e.type] ?? e.type}: <M>{formatBRL(e.amountCents)}</M> · {when(e.createdAt)}</li>)}
                  {d.cancelledAt && <li className="text-red-700 dark:text-red-300">Cancelado · {when(d.cancelledAt)}</li>}
                </ol>
              </section>
            </>
          )}
        </div>
      </aside>
    </>
  );
}

/** Lista compacta dos pedidos (clique abre o painel; ↑/↓ passa de pedido). */
export function SalesTable({ rows }: { rows: Row[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const i = open ? rows.findIndex((r) => r.id === open) : -1;
  const close = useCallback(() => setOpen(null), []);
  const list = useRef<HTMLUListElement>(null);
  // As cores da marca (--brand, --brand-2) vêm da moldura da equipe; o painel vai para o body, então leva as cores junto.
  const colors = () => {
    const cs = list.current ? getComputedStyle(list.current) : null;
    return cs ? ({ "--brand": cs.getPropertyValue("--brand"), "--brand-2": cs.getPropertyValue("--brand-2") } as React.CSSProperties) : undefined;
  };
  return (
    <>
      <ul ref={list} className="flex flex-col divide-y divide-stone-200/70 dark:divide-white/10">
        {rows.map((o) => (
          <li key={o.id}>
            <button type="button" onClick={() => setOpen(o.id === open ? null : o.id)} className={`group grid w-full grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 px-4 py-3 text-left transition-colors md:grid-cols-[5.5rem_minmax(0,7rem)_auto_minmax(0,1fr)_6.5rem_4.5rem_1rem] md:px-5 ${open === o.id ? "bg-brand/8" : "hover:bg-white/50 dark:hover:bg-white/5"}`}>
              <span className="text-xs tabular-nums text-stone-500">{short(o.createdAt)}</span>
              <span className="text-right font-semibold tabular-nums md:hidden"><M>{formatBRL(o.subtotalCents)}</M></span>
              <span className="truncate font-mono text-sm font-semibold">{o.name}</span>
              <span className="hidden md:block"><span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS[o.status]}`}>{o.status === "PENDING" ? "Aguardando" : SALE_STATUS_LABEL[o.status]}</span></span>
              <span className="col-span-2 min-w-0 md:col-span-1">
                {o.creatorId ? (
                  <span className="flex min-w-0 items-center gap-2"><span className="min-w-0 truncate font-medium">{o.creatorName}</span>{o.codes[0] && <span className="shrink-0 rounded-md bg-stone-500/10 px-1.5 py-0.5 font-mono text-[11px]">{o.codes[0]}</span>}</span>
                ) : (
                  <span className="flex min-w-0 items-center gap-2 text-xs text-stone-500">{o.codes[0] && <span className="shrink-0 rounded-md bg-amber-500/15 px-1.5 py-0.5 font-mono text-[11px] text-amber-900 dark:text-amber-200">{o.codes[0]}</span>}<span className="min-w-0 truncate">{o.reason}</span></span>
                )}
              </span>
              <span className="hidden text-right font-semibold tabular-nums md:block"><M>{formatBRL(o.subtotalCents)}</M></span>
              <span className="hidden text-right text-xs tabular-nums text-stone-500 md:block">{o.commissionCents === null ? "—" : o.status === "PENDING" && o.commissionCents === 0 ? "ao pagar" : <M>{formatBRL(o.commissionCents)}</M>}</span>
              <ChevronRight className={`hidden size-4 md:block ${open === o.id ? "text-brand" : "text-stone-300 group-hover:text-stone-500"}`} />
            </button>
          </li>
        ))}
      </ul>
      {/* Portal: o vidro da lista (backdrop-filter) prenderia o painel fixo dentro dela. */}
      {open && typeof document !== "undefined" && createPortal(<div className="dash" style={colors()}><OrderPanel id={open} onClose={close} onPrev={i > 0 ? () => setOpen(rows[i - 1]!.id) : null} onNext={i >= 0 && i < rows.length - 1 ? () => setOpen(rows[i + 1]!.id) : null} /></div>, document.body)}
    </>
  );
}
