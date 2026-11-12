"use client";

import { AlertTriangle, Check, Clock, ExternalLink, Gift, IdCard, MapPin, MessageCircle, Package, Printer, Truck } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { HelpTip } from "@/components/ui/tour";
import { ProductThumb } from "@/components/ui/product-thumb";
import { ui } from "@/components/ui/styles";
import { formatBRL, shortBRL, waitingTone } from "@/domain";
import type { ShipmentAddress } from "@/lib/shipments/address";
import type { CreatorShipContext } from "@/lib/shipments/board";
import { Avatar } from "../creators/list-parts";
import { MessageSheet, SidePanel } from "../desempenho/parts";
import { ApprovalForms, CancelForm, DeliveredForm, ShippedForm } from "./forms";

type Status = "AWAITING_APPROVAL" | "PREPARING" | "SHIPPED" | "DELIVERED" | "CANCELLED";
export type ShipRow = {
  id: string;
  status: Status;
  note: string | null;
  carrier: string | null;
  trackingCode: string | null;
  trackingUrl: string | null;
  createdAt: Date;
  approvedAt: Date | null;
  olistSentAt: Date | null;
  shippedAt: Date | null;
  deliveredAt: Date | null;
  deliveredBy: string | null;
  cancelledAt: Date | null;
  rejectReason: string | null;
  olistOrderNumber: string | null;
  olistError: string | null;
  freightCents: number | null;
  kitLabel: string | null;
  items: { title: string; quantity: number; image: string | null }[];
  creator: { id: string; name: string; allergies: string | null };
  address: ShipmentAddress | null;
  addressLines: string[];
  recipient: { cpf: string | null; cnpj: string | null; phone: string | null; email: string } | null;
  canManage: boolean;
  canApprove: boolean;
  context: CreatorShipContext | null;
};
type Month = { products: { title: string; units: number; image: string | null }[]; units: number; freightCents: number; shipments: number };

const LABEL: Record<Status, string> = { AWAITING_APPROVAL: "Aguardando aprovação", PREPARING: "Preparando", SHIPPED: "A caminho", DELIVERED: "Entregue", CANCELLED: "Cancelado" };
const day = (d: Date | string) => new Date(d).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "2-digit" });
const daysSince = (d: Date | string, now: number) => Math.max(0, Math.floor((now - new Date(d).getTime()) / 86_400_000));
const stageStart = (s: ShipRow) => (s.status === "SHIPPED" ? s.shippedAt : s.status === "PREPARING" ? (s.approvedAt ?? s.createdAt) : s.status === "AWAITING_APPROVAL" ? s.createdAt : null);
const RECEIPT_MSG = {
  title: "Seu produto chegou?",
  body: "Oi, {nome}! Seu envio saiu há alguns dias 📦\n\nJá chegou aí? Se sim, toca em *Recebi* no portal (aba Produtos). Se ainda não chegou, me avisa por aqui que a gente confere o rastreio!",
};

function Stage({ s, now }: { s: ShipRow; now: number }) {
  const start = stageStart(s);
  if (!start) return null;
  const d = daysSince(start, now);
  const tone = s.status === "SHIPPED" ? (d >= 10 ? "late" : "ok") : waitingTone(d);
  const cls = tone === "late" ? "bg-red-500/12 text-red-800 dark:text-red-300" : tone === "warn" ? "bg-amber-500/15 text-amber-900 dark:text-amber-200" : "bg-stone-500/10 text-stone-600 dark:text-stone-300";
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${cls}`}><Clock className="size-3" />{d === 0 ? "hoje" : `há ${d} ${d === 1 ? "dia" : "dias"}`}</span>;
}

function Allergy({ s }: { s: ShipRow }) {
  if (!s.creator.allergies) return null;
  return <span className="inline-flex items-center gap-1 rounded-full bg-red-500/12 px-2 py-0.5 text-[11px] font-semibold text-red-800 dark:text-red-300"><AlertTriangle className="size-3" />alergia</span>;
}

/** Faixa: caminho do envio em quadros (abrem a lista) e os atalhos da equipe. */
export function ShipHero({ brandName, current, counts, canCreate, canPrintAll, newForm }: { brandName: string; current: string; counts: { awaiting: number; preparing: number; shipped: number; stale: number; deliveredThisMonth: number }; canCreate: boolean; canPrintAll: boolean; newForm: React.ReactNode }) {
  const [creating, setCreating] = useState(false);
  const tiles = [
    { key: "AWAITING_APPROVAL", label: "Aguardando aprovação", n: counts.awaiting, hint: "pedidos das creators", dot: counts.awaiting ? "seg-bad" : "seg-good" },
    { key: "PREPARING", label: "Preparando", n: counts.preparing, hint: "na fila do Envio", dot: counts.preparing ? "seg-warn" : "seg-good" },
    { key: "SHIPPED", label: "A caminho", n: counts.shipped, hint: "com rastreio", dot: "seg-info" },
    { key: "parado", label: "Sem Recebi 10+ dias", n: counts.stale, hint: "possível extravio", dot: counts.stale ? "seg-bad" : "seg-good" },
    { key: "DELIVERED", label: "Entregues no mês", n: counts.deliveredThisMonth, hint: "confirmados", dot: "seg-good" },
  ];
  return (
    <section className="@container relative isolate overflow-hidden rounded-[32px] text-white shadow-[0_30px_60px_-34px_var(--brand)]">
      <div aria-hidden className="brand-art absolute inset-0 -z-10" />
      <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(80%_60%_at_50%_-20%,rgb(255_255_255/0.22),transparent_70%)]" />
      <div className="flex flex-col gap-5 p-5 md:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-white/70">{brandName}</p>
            <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight md:text-3xl">Envios <HelpTip id="en-situacao" /></h1>
            <p className="mt-1 max-w-xl text-sm text-white/80">Pedidos das creators chegam em Aguardando aprovação; a Gestão aprova e vão para Preparando. Marque como enviado com o rastreio e acompanhe a entrega.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {canCreate && <button type="button" data-tour="en-novo" onClick={() => setCreating((v) => !v)} aria-expanded={creating} className="peek-chip"><Package className="size-3.5" />{creating ? "Fechar novo envio" : "Novo envio"}</button>}
            {canPrintAll && counts.preparing > 0 && <a href="/imprimir/envios?todos=1" target="_blank" rel="noopener noreferrer" className="peek-chip"><Printer className="size-3.5" />Etiquetas de todos em Preparando ({counts.preparing})</a>}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 @2xl:grid-cols-3 @5xl:grid-cols-5" data-tour="en-aviso">
          {tiles.map((t) => {
            const on = current === t.key;
            const href = t.key === "parado" ? "/admin/envios?parado=1" : on ? "/admin/envios" : `/admin/envios?situacao=${t.key}`;
            return (
              <Link key={t.key} href={href} aria-current={on ? "page" : undefined} className={`seg-tile frost-tile flex min-w-0 flex-col items-start gap-0.5 rounded-2xl px-3.5 py-3 text-left text-stone-900 dark:text-white ${on ? "is-on" : ""}`}>
                <span className="flex w-full items-center justify-between gap-2 text-[11px] font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-300"><span className="truncate">{t.label}</span><span className={`seg-dot ${t.dot}`} /></span>
                <span className="text-2xl font-semibold tabular-nums leading-tight">{t.n}</span>
                <span className="w-full truncate text-[11px] text-stone-500 dark:text-stone-300">{t.hint}</span>
              </Link>
            );
          })}
        </div>
        {creating && <div className="rounded-3xl bg-white/90 p-4 text-stone-900 dark:bg-stone-900/90 dark:text-stone-100">{newForm}</div>}
      </div>
    </section>
  );
}

/** Lista compacta + painel em modo fila (ao aprovar, enviar ou entregar, abre o próximo). Em Preparando, marcar vários para imprimir. */
export function ShipQueue({ rows, canPrint, emptyText }: { rows: ShipRow[]; canPrint: boolean; emptyText: string }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const lastIdx = useRef(0);
  const now = useMemo(() => Date.now(), []);
  const idx = rows.findIndex((r) => r.id === openId);
  useEffect(() => {
    if (openId && idx === -1) setOpenId(rows.length ? rows[Math.min(lastIdx.current, rows.length - 1)]!.id : null);
    if (idx >= 0) lastIdx.current = idx;
  }, [rows, openId, idx]);
  useEffect(() => {
    if (idx < 0) return;
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input, textarea, select")) return;
      if (e.key === "ArrowDown" && idx < rows.length - 1) { e.preventDefault(); setOpenId(rows[idx + 1]!.id); }
      if (e.key === "ArrowUp" && idx > 0) { e.preventDefault(); setOpenId(rows[idx - 1]!.id); }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [idx, rows]);
  const printable = rows.filter((r) => r.status === "PREPARING" && r.address);
  const sel = printable.filter((r) => picked.has(r.id));
  const open = idx >= 0 ? rows[idx]! : null;

  if (rows.length === 0) return <section className="glass rounded-3xl p-10 text-center text-sm text-stone-500">{emptyText}</section>;
  return (
    <>
      {canPrint && printable.length > 0 && (
        <section className="glass flex flex-wrap items-center gap-2 rounded-3xl p-3 md:p-4">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={sel.length === printable.length} onChange={() => setPicked(sel.length === printable.length ? new Set() : new Set(printable.map((r) => r.id)))} className="size-4 accent-[var(--brand)]" />
            Marcar todos em Preparando
          </label>
          <span className="text-sm text-stone-500"><strong className="text-stone-800 dark:text-stone-100">{sel.length}</strong> marcados</span>
          <a aria-disabled={!sel.length} href={sel.length ? `/imprimir/envios?ids=${sel.map((r) => r.id).join(",")}` : undefined} target="_blank" rel="noopener noreferrer" className={`${ui.btnSm} ml-auto ${sel.length ? "" : "pointer-events-none opacity-50"}`}>
            <Printer className="size-3.5" />Imprimir etiquetas dos marcados
          </a>
        </section>
      )}
      <section className="@container glass overflow-hidden rounded-3xl !p-0">
        <ul data-tour="en-cartao" className="flex flex-col divide-y divide-stone-200/70 dark:divide-white/10">
          {rows.map((s) => (
            <li key={s.id} className={`flex items-center gap-3 px-4 py-3 @3xl:px-5 ${openId === s.id ? "bg-brand/8" : "hover:bg-stone-500/5"}`}>
              {canPrint && s.status === "PREPARING" && s.address && (
                <input type="checkbox" checked={picked.has(s.id)} onChange={() => setPicked((p) => { const n = new Set(p); if (n.has(s.id)) n.delete(s.id); else n.add(s.id); return n; })} aria-label={`Marcar ${s.creator.name}`} className="size-4 shrink-0 accent-[var(--brand)]" />
              )}
              <button type="button" onClick={() => setOpenId(s.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                <Avatar name={s.creator.name} id={s.creator.id} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{s.creator.name}</span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
                    <span className="rounded-full bg-stone-500/10 px-2 py-0.5 text-[11px] font-medium text-stone-700 dark:text-stone-200">{LABEL[s.status]}</span>
                    {s.kitLabel && <span className="text-[11px] text-stone-500">{s.kitLabel}</span>}
                    <Stage s={s} now={now} />
                    <Allergy s={s} />
                    {s.olistError && s.status === "PREPARING" && <span className="rounded-full bg-red-500/12 px-2 py-0.5 text-[11px] font-medium text-red-800 dark:text-red-300">erro no Olist</span>}
                  </span>
                </span>
                <span className="hidden shrink-0 items-center -space-x-2 @xl:flex">
                  {s.items.slice(0, 4).map((it) => <span key={it.title} className="rounded-xl ring-2 ring-white dark:ring-stone-900"><ProductThumb src={it.image} title={it.title} size="sm" /></span>)}
                  {s.items.length > 4 && <span className="grid size-8 place-content-center rounded-xl bg-stone-200 text-[11px] font-semibold dark:bg-stone-700">+{s.items.length - 4}</span>}
                </span>
                <span className="shrink-0 text-right text-xs text-stone-500 tabular-nums">{s.items.reduce((n, it) => n + it.quantity, 0)} un.</span>
              </button>
            </li>
          ))}
        </ul>
      </section>
      {open && (
        <SidePanel
          label={`Envio de ${open.creator.name}`}
          onClose={() => setOpenId(null)}
          header={
            <span className="flex items-center gap-3">
              <span className="rounded-full ring-2 ring-white/60"><Avatar name={open.creator.name} id={open.creator.id} size="lg" /></span>
              <span className="min-w-0">
                <span className="block truncate text-lg font-semibold leading-tight">{open.creator.name}</span>
                <span className="block text-xs text-white/80">{LABEL[open.status]}{open.kitLabel ? ` · ${open.kitLabel}` : ""} · {idx + 1} de {rows.length}</span>
              </span>
            </span>
          }
        >
          <Panel s={open} now={now} />
        </SidePanel>
      )}
    </>
  );
}

function Panel({ s, now }: { s: ShipRow; now: number }) {
  const steps: { label: string; at: Date | null; done: boolean; note?: string | undefined }[] = [
    { label: s.approvedAt ? "Pedido da creator" : "Envio registrado", at: s.createdAt, done: true },
    ...(s.approvedAt || s.status === "AWAITING_APPROVAL" ? [{ label: "Aprovado pela Gestão", at: s.approvedAt, done: Boolean(s.approvedAt) }] : []),
    ...(s.olistSentAt || s.olistOrderNumber || s.olistError ? [{ label: "Pedido no Olist", at: s.olistSentAt, done: Boolean(s.olistOrderNumber), note: s.olistOrderNumber ? `nº ${s.olistOrderNumber}` : s.olistError ?? undefined }] : []),
    { label: "Enviado", at: s.shippedAt, done: Boolean(s.shippedAt), note: s.trackingCode ? `${s.carrier ?? ""} ${s.trackingCode}`.trim() : undefined },
    { label: "Entregue", at: s.deliveredAt, done: Boolean(s.deliveredAt), note: s.deliveredAt ? (s.deliveredBy === "CREATOR" ? "confirmado pela creator" : "marcado pela equipe") : undefined },
  ];
  const ctx = s.context;
  return (
    <>
      <div className="flex flex-wrap gap-1.5"><Stage s={s} now={now} /></div>
      {s.creator.allergies && (
        <p className="flex items-start gap-2 rounded-2xl bg-red-500/10 p-3 text-sm text-red-800 dark:text-red-300"><AlertTriangle className="mt-0.5 size-4 shrink-0" /><span><strong>Alergia ou restrição:</strong> {s.creator.allergies}. Confira os produtos antes de mandar.</span></p>
      )}
      <ul className="flex flex-col gap-2">
        {s.items.map((it) => (
          <li key={it.title} className="liquid-tile flex items-center gap-3 rounded-2xl px-3 py-2">
            <ProductThumb src={it.image} title={it.title} size="sm" />
            <span className="min-w-0 flex-1 truncate text-sm">{it.title}</span>
            <span className="shrink-0 text-sm font-semibold tabular-nums">{it.quantity}×</span>
          </li>
        ))}
      </ul>
      {s.note && <p className="text-sm text-stone-600 dark:text-stone-300">{s.note}</p>}

      {ctx && (
        <div className="liquid-tile flex flex-col gap-1.5 rounded-2xl px-3 py-2.5 text-sm">
          <span className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-stone-500"><Gift className="size-3.5" />Próximo kit</span>
          <span>{ctx.total} {ctx.total === 1 ? "envio" : "envios"} no total{ctx.lastSentAt ? ` · último enviado em ${day(ctx.lastSentAt)}` : " · nenhum enviado ainda"}</span>
          {ctx.openCount > 1 && <span className="font-medium text-amber-800 dark:text-amber-300">Ela tem {ctx.openCount} envios abertos: confira se não é repetido.</span>}
          {ctx.pendingKits.length ? (
            <span className="text-emerald-800 dark:text-emerald-300">Liberado e esperando a escolha dela: {ctx.pendingKits.map((k) => `${k.label} (${k.products} ${k.products === 1 ? "produto" : "produtos"})`).join(", ")}.</span>
          ) : (
            <span className="text-stone-500">Nenhum kit liberado esperando a escolha. O próximo sai pela regra do contrato dela.</span>
          )}
        </div>
      )}

      {(s.recipient || s.address) && (
        <div className="liquid-tile flex flex-col gap-2 rounded-2xl px-3 py-2.5 text-xs">
          {s.recipient && (
            <span className="flex gap-2"><IdCard className="mt-0.5 size-3.5 shrink-0 text-stone-500" /><span>{s.recipient.cpf ? <>CPF <span className="font-mono">{s.recipient.cpf}</span></> : "CPF não informado"}{s.recipient.cnpj && <> · CNPJ <span className="font-mono">{s.recipient.cnpj}</span></>}<br />{[s.recipient.phone, s.recipient.email].filter(Boolean).join(" · ")}</span></span>
          )}
          {s.address && <span className="flex gap-2"><MapPin className="mt-0.5 size-3.5 shrink-0 text-stone-500" /><span>{s.addressLines.map((l) => <span key={l} className="block">{l}</span>)}</span></span>}
        </div>
      )}

      <div className="flex flex-col gap-1">
        <span className="text-[11px] font-medium uppercase tracking-wide text-stone-500">Linha do tempo</span>
        <ol className="flex flex-col">
          {steps.map((st, i) => (
            <li key={st.label} className="relative flex gap-3 pb-3 last:pb-0">
              {i < steps.length - 1 && <span aria-hidden className={`absolute left-[9px] top-5 h-full w-0.5 ${st.done ? "bg-brand/40" : "bg-stone-300/60 dark:bg-white/10"}`} />}
              <span className={`relative z-10 mt-0.5 grid size-5 shrink-0 place-content-center rounded-full ${st.done ? "bg-brand text-white dark:bg-brand-2 dark:text-stone-900" : "border-2 border-stone-300 bg-white dark:border-white/20 dark:bg-stone-900"}`}>{st.done && <Check className="size-3" />}</span>
              <span className="min-w-0 text-sm">
                <span className={st.done ? "font-medium" : "text-stone-500"}>{st.label}</span>
                <span className="block text-xs text-stone-500">{st.at ? day(st.at) : "—"}{st.note ? ` · ${st.note}` : ""}</span>
              </span>
            </li>
          ))}
          {s.cancelledAt && <li className="text-sm text-red-700 dark:text-red-400">{s.rejectReason ? `Recusado em ${day(s.cancelledAt)}: ${s.rejectReason}` : `Cancelado em ${day(s.cancelledAt)}`}</li>}
        </ol>
      </div>
      {s.trackingUrl && <a href={s.trackingUrl} target="_blank" rel="noopener noreferrer" className={`${ui.ghostSm} self-start`}><Truck className="size-3.5" />Rastrear<ExternalLink className="size-3" /></a>}
      {s.freightCents !== null && <p className="text-xs text-stone-500">Frete pago: {formatBRL(s.freightCents)}</p>}

      {s.status === "AWAITING_APPROVAL" && (s.canApprove ? <div data-tour="en-aprovar" className="border-t border-stone-200/70 pt-4 dark:border-white/10"><ApprovalForms shipmentId={s.id} /></div> : <p className={ui.hint}>Pedido da creator esperando a aprovação da Gestão.</p>)}
      {s.canManage && (s.status === "PREPARING" || s.status === "SHIPPED") && (
        <div className="flex flex-col gap-3 border-t border-stone-200/70 pt-4 dark:border-white/10">
          {s.status === "PREPARING" && <div data-tour="en-enviado"><ShippedForm shipmentId={s.id} /></div>}
          <div className="flex flex-wrap items-center gap-2">
            {s.address && <a href={`/imprimir/envios?ids=${s.id}`} target="_blank" rel="noopener noreferrer" className={ui.ghostSm}><Printer className="size-3.5" />Etiqueta e declaração</a>}
            {s.status === "SHIPPED" && <DeliveredForm shipmentId={s.id} />}
            <CancelForm shipmentId={s.id} />
          </div>
        </div>
      )}
      <Link href={`/admin/creators/${s.creator.id}`} className={`${ui.ghostSm} self-start`}>Abrir a ficha</Link>
    </>
  );
}

/** Atrasados no Olist, produtos do mês e cobrar o "Recebi" dos parados. */
export function ShipExtras({ olistLate, month, stale, canMessage }: { olistLate: { id: string; name: string; days: number; reason: string }[]; month: Month; stale: { id: string; creatorId: string; name: string; days: number }[]; canMessage: boolean }) {
  const [msg, setMsg] = useState(false);
  return (
    <div className="@container">
      <div className="grid gap-3 @4xl:grid-cols-3">
        <section className="liquid-tile flex flex-col gap-2 rounded-3xl p-4">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold"><AlertTriangle className="size-4 text-amber-600" />Atrasou no Olist <span className="text-stone-500">{olistLate.length}</span></h3>
          <p className="text-xs text-stone-500">Em Preparando com erro no Olist ou há 3+ dias sem sair.</p>
          {olistLate.length === 0 ? <p className="text-sm text-stone-500">Nada atrasado. 🎉</p> : (
            <ul className="flex max-h-56 flex-col gap-1.5 overflow-y-auto text-sm">
              {olistLate.map((o) => <li key={o.id}><span className="font-medium">{o.name}</span> <span className="text-xs text-stone-500">· há {o.days}d · {o.reason}</span></li>)}
            </ul>
          )}
        </section>
        <section className="liquid-tile flex flex-col gap-2 rounded-3xl p-4">
          <h3 className="text-sm font-semibold">Produtos do mês</h3>
          <p className="text-xs text-stone-500">{month.units} unidades em {month.shipments} envios · frete <span className="money">{shortBRL(month.freightCents)}</span></p>
          {month.products.length === 0 ? <p className="text-sm text-stone-500">Nada enviado neste mês ainda.</p> : (
            <ul className="flex max-h-56 flex-col gap-1.5 overflow-y-auto">
              {month.products.map((p) => (
                <li key={p.title} className="flex items-center gap-2 text-sm">
                  <ProductThumb src={p.image} title={p.title} size="sm" />
                  <span className="min-w-0 flex-1 truncate">{p.title}</span>
                  <span className="shrink-0 font-semibold tabular-nums">{p.units}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="liquid-tile flex flex-col gap-2 rounded-3xl p-4">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold"><MessageCircle className="size-4" />Sem &quot;Recebi&quot; <span className="text-stone-500">{stale.length}</span></h3>
          <p className="text-xs text-stone-500">Enviados há 10+ dias e ela ainda não confirmou.</p>
          {stale.length === 0 ? <p className="text-sm text-stone-500">Ninguém esperando confirmação. 🎉</p> : (
            <>
              <ul className="flex max-h-40 flex-col gap-1 overflow-y-auto text-sm">{stale.map((x) => <li key={x.id} className="flex justify-between gap-2"><span className="truncate">{x.name}</span><span className="shrink-0 text-xs text-stone-500">há {x.days}d</span></li>)}</ul>
              {canMessage && <button type="button" onClick={() => setMsg(true)} className={`${ui.btnSm} mt-auto self-start`}><MessageCircle className="size-3.5" />Perguntar se chegou</button>}
            </>
          )}
        </section>
      </div>
      {msg && <MessageSheet ids={[...new Set(stale.map((x) => x.creatorId))]} names={stale.map((x) => x.name)} {...RECEIPT_MSG} onClose={() => setMsg(false)} />}
    </div>
  );
}
