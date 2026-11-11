"use client";

import { ChevronDown, ChevronUp, ExternalLink, Package, FileSignature, MapPin, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { InstagramIcon, TikTokIcon, WhatsAppIcon } from "@/components/ui/social-icons";
import { badge } from "@/components/ui/styles";
import { CREATOR_CATEGORY_LABEL, formatBRL, instagramUrl, originText, whatsappChatUrl } from "@/domain";
import type { CreatorPeek } from "@/lib/creators/peek";
import { peekAction } from "./actions";
import { Avatar, CopyChip, LastSale, Sparkline, TrendChip } from "./list-parts";
import type { Row } from "./list";

const ext = { target: "_blank", rel: "noopener noreferrer" } as const;
const br = (day: string) => day.split("-").reverse().join("/");
const dt = (d: Date | string) => new Date(d).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
const pct = (bps: number) => `${(bps / 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;

function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="liquid-tile flex min-w-0 flex-col gap-0.5 rounded-2xl px-3 py-2.5">
      <span className="text-[11px] font-medium uppercase tracking-wide text-stone-500">{label}</span>
      <span className="truncate text-base font-semibold tabular-nums">{value}</span>
      {sub && <span className="truncate text-[11px] text-stone-500">{sub}</span>}
    </div>
  );
}

/**
 * Painel lateral da lista (D-CREATORLIST): resumo da creator sem sair da lista. ↑/↓ passa para a anterior/próxima da
 * lista filtrada, Esc fecha. No celular abre de baixo, ocupando quase a tela.
 */
export function PeekPanel({ row, onClose, onPrev, onNext, daysAgo }: { row: Row; onClose: () => void; onPrev: (() => void) | null; onNext: (() => void) | null; daysAgo: number | null }) {
  const [peek, setPeek] = useState<CreatorPeek | null | undefined>(undefined);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let live = true;
    setPeek(undefined);
    void peekAction(row.id).then((p) => live && setPeek(p));
    ref.current?.scrollTo({ top: 0 });
    return () => {
      live = false;
    };
  }, [row.id]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input,textarea,select,[contenteditable]")) return;
      if (e.key === "Escape") onClose();
      else if ((e.key === "ArrowDown" || e.key === "j") && onNext) { e.preventDefault(); onNext(); }
      else if ((e.key === "ArrowUp" || e.key === "k") && onPrev) { e.preventDefault(); onPrev(); }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose, onNext, onPrev]);

  const wa = row.phone ? whatsappChatUrl(row.phone) : null;
  const ig = row.instagram ? instagramUrl(row.instagram) : null;
  const s = row.stats;
  const m = peek?.money;
  return (
    <>
      <button type="button" aria-label="Fechar o painel" onClick={onClose} className="fixed inset-0 z-40 bg-stone-950/25 backdrop-blur-[2px] lg:hidden" />
      <aside
        aria-label={`Resumo de ${row.name}`}
        className="peek-panel glass fixed inset-x-2 bottom-2 top-16 z-50 flex flex-col overflow-hidden rounded-3xl lg:inset-x-auto lg:bottom-4 lg:right-4 lg:top-4 lg:w-[400px]"
      >
        <header className="relative overflow-hidden px-5 pb-4 pt-5 text-white">
          <div aria-hidden className="brand-art absolute inset-0 -z-10" />
          <div className="flex items-start justify-between gap-2">
            <div className="flex gap-1">
              <button type="button" disabled={!onPrev} onClick={() => onPrev?.()} aria-label="Creator anterior (↑)" className="peek-btn"><ChevronUp className="size-4" /></button>
              <button type="button" disabled={!onNext} onClick={() => onNext?.()} aria-label="Próxima creator (↓)" className="peek-btn"><ChevronDown className="size-4" /></button>
            </div>
            <button type="button" onClick={onClose} aria-label="Fechar (Esc)" className="peek-btn"><X className="size-4" /></button>
          </div>
          <div className="mt-3 flex items-center gap-3">
            <span className="rounded-full ring-2 ring-white/60"><Avatar name={row.name} size="lg" /></span>
            <div className="min-w-0">
              <h2 className="truncate text-lg font-semibold leading-tight">{row.name}</h2>
              <p className="truncate text-xs text-white/80">
                {row.statusLabel}
                {row.categories.length > 0 && <> · {row.categories.map((k) => CREATOR_CATEGORY_LABEL[k]).join(", ")}</>}
              </p>
              {row.coupon && <p className="mt-0.5 font-mono text-sm font-semibold tracking-wide">{row.coupon}</p>}
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-1.5">
            {wa && <a href={wa} {...ext} className="peek-chip"><WhatsAppIcon className="size-3.5" />WhatsApp</a>}
            {ig && <a href={ig} {...ext} className="peek-chip"><InstagramIcon className="size-3.5" />Instagram</a>}
            {row.tiktok && <a href={`https://www.tiktok.com/@${row.tiktok.replace(/^@/, "")}`} {...ext} className="peek-chip"><TikTokIcon className="size-3.5" />TikTok</a>}
            {row.coupon && <CopyChip value={row.coupon} label="Copiar cupom" />}
          </div>
        </header>

        <div ref={ref} className="flex flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
          {s && (
            <section className="flex flex-col gap-2">
              <div className="grid grid-cols-2 gap-2">
                <Stat label="Vendas 30 dias" value={formatBRL(s.sales30Cents)} sub={<span className="inline-flex items-center gap-1"><TrendChip current={s.sales30Cents} previous={s.prev30Cents} /> vs. 30 dias antes</span>} />
                <Stat label="Vendas no total" value={formatBRL(s.salesCents)} sub={`${s.orders} pedido${s.orders === 1 ? "" : "s"}`} />
                <Stat label="Saldo para saque" value={m ? formatBRL(m.availableCents) : peek === undefined ? "…" : "—"} sub={m ? (m.withdrawalsUnlocked ? (m.requestedCents ? `${formatBRL(m.requestedCents)} já pedido` : "liberado") : "abertura ainda não aprovada") : undefined} />
                <Stat label="A liberar no dia 1" value={m ? formatBRL(Math.max(0, m.heldCents)) : peek === undefined ? "…" : "—"} sub={m?.rateBps != null ? `comissão de ${pct(m.rateBps)}` : undefined} />
              </div>
              <div className="liquid-tile flex items-center justify-between gap-3 rounded-2xl px-3 py-2.5">
                <span className="flex flex-col">
                  <span className="text-[11px] font-medium uppercase tracking-wide text-stone-500">Últimas 12 semanas</span>
                  <LastSale day={row.lastOrder?.day ?? null} daysAgo={daysAgo} />
                </span>
                <Sparkline weeks={s.weeks} className="h-8 w-40" />
              </div>
            </section>
          )}
          {!s && <LastSale day={row.lastOrder?.day ?? null} daysAgo={daysAgo} />}

          {(row.pendings.length > 0 || !row.hasLogin) && (
            <section className="flex flex-wrap gap-1.5">
              {!row.hasLogin && <span className={badge.neutral}>sem acesso ao portal</span>}
              {row.pendings.map((x) => <span key={x} className={badge.amber}>{x}</span>)}
            </section>
          )}

          <section className="flex flex-col gap-2 text-sm">
            <p className="flex items-start gap-2">
              <FileSignature className="mt-0.5 size-4 shrink-0 text-stone-400" />
              {peek === undefined ? (
                <span className="text-stone-400">…</span>
              ) : peek?.contract.end ? (
                <span>
                  Contrato {peek.contract.start ? `de ${br(peek.contract.start)} ` : ""}até {br(peek.contract.end)}
                  {peek.contract.status === "EXPIRING" && <span className={`${badge.amber} ml-1.5`}>vence em {peek.contract.daysLeft}d</span>}
                  {peek.contract.status === "EXPIRED" && <span className={`${badge.red} ml-1.5`}>vencido</span>}
                </span>
              ) : (
                <span className="text-stone-500">Sem datas de contrato na ficha</span>
              )}
            </p>
            <p className="flex items-start gap-2">
              <Package className="mt-0.5 size-4 shrink-0 text-stone-400" />
              {peek === undefined ? <span className="text-stone-400">…</span> : peek?.shipment ? <span>{peek.shipment.status} · {dt(peek.shipment.day)}</span> : <span className="text-stone-500">Nenhum envio ainda</span>}
            </p>
            {(row.city || row.state) && (
              <p className="flex items-start gap-2"><MapPin className="mt-0.5 size-4 shrink-0 text-stone-400" />{row.city ? `${row.city}/${row.state ?? ""}` : row.state}</p>
            )}
            <p className="text-xs text-stone-500">
              Entrou em {dt(row.joinedAt)}
              {row.origin && row.origin.kind !== "UNKNOWN" && <> · veio de {originText(row.origin)}</>}
            </p>
            {row.tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {row.tags.map((t) => <span key={t.id} className="rounded-full border border-brand/30 bg-brand/10 px-2 py-0.5 text-[11px] font-medium text-brand dark:border-brand-2/30 dark:bg-brand-2/15 dark:text-brand-2">{t.name}</span>)}
              </div>
            )}
          </section>

          {peek && peek.events.length > 0 && (
            <section className="flex flex-col gap-2">
              <h3 className="text-[11px] font-medium uppercase tracking-wide text-stone-500">Últimos acontecimentos</h3>
              <ol className="flex flex-col gap-2 border-l border-stone-200 pl-3 dark:border-white/10">
                {peek.events.map((e, i) => (
                  <li key={i} className="relative text-sm">
                    <span aria-hidden className="absolute -left-[17px] top-1.5 size-2 rounded-full bg-brand/60 ring-2 ring-white dark:bg-brand-2/70 dark:ring-stone-900" />
                    <span className="block leading-snug">{e.title}</span>
                    <span className="text-xs text-stone-500">{dt(e.at)}{e.detail ? ` · ${e.detail}` : ""}</span>
                  </li>
                ))}
              </ol>
            </section>
          )}
          {peek === null && <p className="text-sm text-stone-500">Não deu para carregar o resumo. Abra a ficha.</p>}
        </div>

        <footer className="border-t border-stone-200/70 p-3 dark:border-white/10">
          <Link href={`/admin/creators/${row.id}`} className="flex w-full items-center justify-center gap-2 rounded-full bg-brand px-4 py-2.5 text-sm font-semibold text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.3),0_10px_24px_-12px_var(--brand)]">
            Abrir a ficha completa <ExternalLink className="size-4" />
          </Link>
        </footer>
      </aside>
    </>
  );
}
