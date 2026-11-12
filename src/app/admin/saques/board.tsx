"use client";

import { AlertTriangle, ClipboardCopy, Clock, ExternalLink, FileText, Keyboard, MessageCircle } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { HelpTip } from "@/components/ui/tour";
import { ui } from "@/components/ui/styles";
import { CopyButton } from "@/components/portal/copy-button";
import { formatBRL, payoutWhatsapp, shortBRL, waitingTone } from "@/domain";
import type { payoutBoard } from "@/lib/withdrawals/board";
import type { withdrawalQueue } from "@/lib/withdrawals/decide";
import type { PayoutSummary } from "@/lib/withdrawals/summary";
import { Avatar } from "../creators/list-parts";
import { MessageSheet, SidePanel } from "../desempenho/parts";
import { ApproveForm, BatchCheck, PayForm, RecheckForm, RejectForm, RemoveRemessaForm } from "./forms";

export type QRow = Awaited<ReturnType<typeof withdrawalQueue>>[number];
type Board = Awaited<ReturnType<typeof payoutBoard>>;
type Tab = "REQUESTED" | "APPROVED" | "DECIDED";

const WITHDRAWAL_STATUS_LABEL = { REQUESTED: "Em análise", APPROVED: "Aprovado", PAID: "Pago", REJECTED: "Recusado", CANCELLED: "Cancelado" } as const;
const M = ({ children }: { children: React.ReactNode }) => <span className="money">{children}</span>;
const day = (d: Date | string) => new Date(d).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "2-digit" });
const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const daysSince = (d: Date | string, now: number) => Math.max(0, Math.floor((now - new Date(d).getTime()) / 86_400_000));
const since = (r: QRow) => (r.status === "APPROVED" ? (r.approvedAt ?? r.requestedAt) : r.requestedAt);

const REMIND = {
  title: "Seu saldo está disponível",
  body: "Oi, {nome}! Você tem saldo de comissão liberado para saque 💛\n\nA janela de pedido está aberta: é só entrar no portal, ir em *Saque* e enviar a nota. Qualquer dúvida, me chama!",
};

/** Selo da nota (D-NFCHECK). */
function NfSeal({ r }: { r: QRow }) {
  const c = "rounded-full px-2 py-0.5 text-[11px] font-medium";
  if (r.individual) return <span className={`${c} bg-sky-500/12 text-sky-800 dark:text-sky-300`}>pessoa física · recibo</span>;
  if (r.nfCheck === "OK") return <span className={`${c} bg-emerald-500/12 text-emerald-800 dark:text-emerald-300`}>nota conferida</span>;
  if (r.nfCheck === "MANUAL") return <span className={`${c} bg-amber-500/15 text-amber-900 dark:text-amber-200`}>conferir a nota</span>;
  return r.hasNf ? <span className={`${c} bg-stone-500/10 text-stone-600 dark:text-stone-300`}>nota sem conferência</span> : null;
}

function Waiting({ r, now }: { r: QRow; now: number }) {
  if (r.status !== "REQUESTED" && r.status !== "APPROVED") return null;
  const d = daysSince(since(r), now);
  const tone = waitingTone(d);
  const cls = tone === "late" ? "bg-red-500/12 text-red-800 dark:text-red-300" : tone === "warn" ? "bg-amber-500/15 text-amber-900 dark:text-amber-200" : "bg-stone-500/10 text-stone-600 dark:text-stone-300";
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${cls}`}><Clock className="size-3" />{d === 0 ? "hoje" : `há ${d} ${d === 1 ? "dia" : "dias"}`}</span>;
}

/** Faixa da tela de Saques: janela, caminho do dinheiro em quadros e o resumo para o WhatsApp. */
export function SaquesHero({ brandName, tab, sum, board, requested, approved, paidThisMonth }: { brandName: string; tab: Tab; sum: PayoutSummary; board: Board; requested: QRow[]; approved: QRow[]; paidThisMonth: { count: number; cents: number } }) {
  const [copied, setCopied] = useState(false);
  const now = Date.now();
  const oldest = requested.length ? Math.max(...requested.map((r) => daysSince(r.requestedAt, now))) : 0;
  const w = board.window;
  const text = payoutWhatsapp({ brand: brandName, today: board.today, requested: requested.map((r) => ({ name: r.name, cents: r.amountCents })), approved: approved.map((r) => ({ name: r.name, cents: r.amountCents })), window: w, endDay: board.days.end });
  const tiles = [
    { href: "/admin/saques?ver=analise", on: tab === "REQUESTED", label: "Em análise", value: <M>{shortBRL(sum.requested.cents)}</M>, hint: sum.requested.count ? `${sum.requested.count} ${sum.requested.count === 1 ? "pedido" : "pedidos"} · mais antigo há ${oldest}d` : "nada para aprovar", dot: sum.requested.count ? "seg-warn" : "seg-good" },
    { href: "/admin/saques?ver=aprovados", on: tab === "APPROVED", label: "Aprovados", value: <M>{shortBRL(sum.approved.cents)}</M>, hint: sum.approved.count ? `${sum.approved.count} esperando o Pix${board.inBank.count ? ` · ${board.inBank.count} no banco` : ""}` : "nada para pagar", dot: sum.approved.count ? "seg-warn" : "seg-good" },
    { href: "/admin/saques?ver=decididos", on: tab === "DECIDED", label: "Pagos no mês", value: <M>{shortBRL(paidThisMonth.cents)}</M>, hint: `${paidThisMonth.count} ${paidThisMonth.count === 1 ? "saque" : "saques"}`, dot: "seg-good" },
    { href: null, on: false, label: "Sacável sem pedido", value: <M>{shortBRL(sum.availableCents)}</M>, hint: `${board.notRequested.length} ${board.notRequested.length === 1 ? "creator" : "creators"} com saldo`, dot: "seg-info" },
    { href: null, on: false, label: "A liberar", value: <M>{shortBRL(sum.heldCents)}</M>, hint: "no fechamento do mês", dot: "seg-info" },
  ];
  return (
    <section className="@container relative isolate overflow-hidden rounded-[32px] text-white shadow-[0_30px_60px_-34px_var(--brand)]">
      <div aria-hidden className="brand-art absolute inset-0 -z-10" />
      <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(80%_60%_at_50%_-20%,rgb(255_255_255/0.22),transparent_70%)]" />
      <div className="flex flex-col gap-5 p-5 md:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-white/70">{brandName}</p>
            <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight md:text-3xl">Saques <HelpTip id="sq-abas" /></h1>
            <p className="mt-1 max-w-xl text-sm text-white/80">A Gestão confere a nota e aprova; o Pagamento faz o Pix e marca como pago. Recusa sempre com o motivo: a creator vê.</p>
          </div>
          <div className="flex flex-col items-start gap-2 @2xl:items-end">
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${w.open ? "bg-emerald-400/25 text-white" : "bg-white/15 text-white/90"}`}>
              {w.open ? `Janela aberta · ${w.daysLeft === 1 ? "último dia" : `faltam ${w.daysLeft} dias`} (até o dia ${board.days.end})` : `Janela fechada · abre em ${w.opensIn} ${w.opensIn === 1 ? "dia" : "dias"} (dia ${board.days.start})`}
            </span>
            <button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(text);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                } catch {}
              }}
              className="peek-chip"
            >
              <ClipboardCopy className="size-3.5" />{copied ? "Copiado!" : "Copiar resumo para o WhatsApp"}
            </button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 @2xl:grid-cols-3 @5xl:grid-cols-5" data-tour="sq-abas">
          {tiles.map((t) => {
            const inner = (
              <>
                <span className="flex w-full items-center justify-between gap-2 text-[11px] font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-300"><span className="truncate">{t.label}</span><span className={`seg-dot ${t.dot}`} /></span>
                <span className="text-xl font-semibold tabular-nums leading-tight @2xl:text-2xl">{t.value}</span>
                <span className="w-full truncate text-[11px] text-stone-500 dark:text-stone-300">{t.hint}</span>
              </>
            );
            const cls = `seg-tile frost-tile flex min-w-0 flex-col items-start gap-0.5 rounded-2xl px-3.5 py-3 text-left text-stone-900 dark:text-white ${t.on ? "is-on" : ""}`;
            return t.href ? <Link key={t.label} href={t.href} aria-current={t.on ? "page" : undefined} className={cls}>{inner}</Link> : <div key={t.label} className={`${cls} opacity-90`}>{inner}</div>;
          })}
        </div>
      </div>
    </section>
  );
}

/** Fila de saques: lista compacta + painel em modo fila (abre o próximo sozinho), com a nota em prévia e atalhos. */
export function SaquesQueue({ rows, tab }: { rows: QRow[]; tab: Tab }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const lastIdx = useRef(0);
  const now = useMemo(() => Date.now(), []);
  const idx = rows.findIndex((r) => r.id === openId);
  // Modo fila: depois de aprovar, pagar ou recusar, o pedido sai da lista e o painel abre o próximo.
  useEffect(() => {
    if (openId && idx === -1) setOpenId(rows.length ? rows[Math.min(lastIdx.current, rows.length - 1)]!.id : null);
    if (idx >= 0) lastIdx.current = idx;
  }, [rows, openId, idx]);
  const open = idx >= 0 ? rows[idx]! : null;
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, select")) return;
      const panel = document.querySelector('aside[aria-label^="Saque de"]');
      if (e.key === "ArrowDown" && idx < rows.length - 1) { e.preventDefault(); setOpenId(rows[idx + 1]!.id); }
      else if (e.key === "ArrowUp" && idx > 0) { e.preventDefault(); setOpenId(rows[idx - 1]!.id); }
      else if (["a", "p", "r"].includes(e.key.toLowerCase())) {
        const el = panel?.querySelector<HTMLElement>(`[data-k="${e.key.toLowerCase()}"]`);
        if (!el) return;
        e.preventDefault();
        if (el.tagName === "INPUT") el.focus();
        else el.click();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [open, idx, rows]);

  if (rows.length === 0) return <section className="glass rounded-3xl p-10 text-center text-sm text-stone-500">{tab === "REQUESTED" ? "Nenhum saque para aprovar. 🎉" : tab === "APPROVED" ? "Nenhum saque esperando o Pix. 🎉" : "Nenhum saque decidido ainda."}</section>;
  return (
    <section className="@container glass overflow-hidden rounded-3xl !p-0">
      <ul className="flex flex-col divide-y divide-stone-200/70 dark:divide-white/10" data-tour="sq-cartao">
        {rows.map((r) => {
          const over = r.availableBeforeCents !== null && r.amountCents > r.availableBeforeCents;
          return (
            <li key={r.id} className={`flex items-center gap-3 px-4 py-3 transition @3xl:px-5 ${openId === r.id ? "bg-brand/8" : "hover:bg-stone-500/5"}`}>
              {r.canPay && <span className="shrink-0" onClick={(e) => e.stopPropagation()}><BatchCheck withdrawalId={r.id} cents={r.amountCents} name={r.name} /></span>}
              <button type="button" onClick={() => setOpenId(r.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                <Avatar name={r.name} id={r.creatorId} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{r.name}</span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
                    <NfSeal r={r} />
                    <Waiting r={r} now={now} />
                    {r.remittance && <span className="rounded-full bg-sky-500/12 px-2 py-0.5 text-[11px] font-medium text-sky-800 dark:text-sky-300">no banco · remessa {r.remittance.nsa}</span>}
                    {tab === "DECIDED" && <span className="text-[11px] text-stone-500">{WITHDRAWAL_STATUS_LABEL[r.status]} {r.decidedAt ? `em ${day(r.decidedAt)}` : ""}</span>}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className={`block font-semibold tabular-nums ${over ? "text-red-700 dark:text-red-400" : ""}`}><M>{formatBRL(r.amountCents)}</M></span>
                  {over && <span className="block text-[11px] text-red-700 dark:text-red-400">acima do saldo</span>}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {open && (
        <SidePanel
          label={`Saque de ${open.name}`}
          onClose={() => setOpenId(null)}
          header={
            <span className="flex items-center gap-3">
              <span className="rounded-full ring-2 ring-white/60"><Avatar name={open.name} id={open.creatorId} size="lg" /></span>
              <span className="min-w-0">
                <span className="block truncate text-lg font-semibold leading-tight">{open.name}</span>
                <span className="block text-2xl font-semibold tabular-nums"><M>{formatBRL(open.amountCents)}</M></span>
                <span className="block text-xs text-white/80">{idx + 1} de {rows.length} · {WITHDRAWAL_STATUS_LABEL[open.status]}</span>
              </span>
            </span>
          }
        >
          <Panel r={open} now={now} />
        </SidePanel>
      )}
    </section>
  );
}

function Panel({ r, now }: { r: QRow; now: number }) {
  const over = r.availableBeforeCents !== null && r.amountCents > r.availableBeforeCents;
  const open = r.status === "REQUESTED" || r.status === "APPROVED";
  const after = r.availableBeforeCents !== null ? r.availableBeforeCents - r.amountCents : null;
  return (
    <>
      <div className="flex flex-wrap gap-1.5"><NfSeal r={r} /><Waiting r={r} now={now} /></div>
      <div className="grid grid-cols-2 gap-2">
        <div className="liquid-tile rounded-2xl px-3 py-2.5">
          <span className="block text-[11px] font-medium uppercase tracking-wide text-stone-500">Saldo antes</span>
          <span className="block font-semibold tabular-nums"><M>{r.availableBeforeCents !== null ? formatBRL(r.availableBeforeCents) : "—"}</M></span>
        </div>
        <div className={`liquid-tile rounded-2xl px-3 py-2.5 ${after !== null && after < 0 ? "ring-1 ring-red-400/50" : ""}`}>
          <span className="block text-[11px] font-medium uppercase tracking-wide text-stone-500">Saldo depois</span>
          <span className={`block font-semibold tabular-nums ${after !== null && after < 0 ? "text-red-700 dark:text-red-400" : ""}`}><M>{after !== null ? formatBRL(after) : "—"}</M></span>
        </div>
      </div>
      {over && <p className="flex items-start gap-2 rounded-2xl bg-red-500/10 p-3 text-sm text-red-800 dark:text-red-300"><AlertTriangle className="mt-0.5 size-4 shrink-0" />Valor acima do saldo: confira antes de aprovar.</p>}
      <div className="liquid-tile flex flex-wrap items-center justify-between gap-2 rounded-2xl px-3 py-2.5">
        <span className="min-w-0">
          <span className="block text-[11px] font-medium uppercase tracking-wide text-stone-500">Chave Pix</span>
          <span className="block truncate font-mono text-sm font-semibold">{r.pixKey ?? "—"}</span>
          {r.document && <span className="block text-xs text-stone-500">{r.document}</span>}
        </span>
        {r.pixKey && <CopyButton value={r.pixKey} label="Copiar" />}
      </div>
      {open && r.individual && <p className="text-sm text-sky-800 dark:text-sky-300">Pessoa física: antes de pagar, confira no app do banco se o nome da chave Pix é o da creator.</p>}
      {open && r.nfCheck === "MANUAL" && <p className="text-sm text-amber-800 dark:text-amber-300">O sistema não conseguiu ler esta nota. Confira tomadora, valor e CNPJ antes de aprovar.</p>}
      {r.hasNf && (
        <div className="flex flex-col gap-1.5">
          <span className="flex items-center justify-between">
            <span className="text-[11px] font-medium uppercase tracking-wide text-stone-500">Nota fiscal</span>
            <span className="flex items-center gap-1.5">
              {r.canRecheck && <RecheckForm withdrawalId={r.id} />}
              <a href={`/admin/saques/nf/${r.id}`} target="_blank" rel="noopener noreferrer" className={ui.ghostSm}><ExternalLink className="size-3.5" />Abrir</a>
            </span>
          </span>
          {/* D-PAYBOARD: prévia da nota no painel (link assinado de 5 minutos). */}
          <iframe key={r.id} src={`/admin/saques/nf/${r.id}`} title={`Nota de ${r.name}`} className="h-80 w-full rounded-2xl border border-stone-200/70 bg-white dark:border-white/10" />
        </div>
      )}
      {r.individual && <a href={`/admin/saques/recibo/${r.id}`} target="_blank" rel="noopener noreferrer" className={`${ui.ghostSm} self-start`}><FileText className="size-3.5" />Recibo</a>}
      {r.status === "REJECTED" && r.note && <p className="text-sm text-stone-600 dark:text-stone-300">Motivo: {r.note}</p>}
      {r.status === "PAID" && r.pixReference && <p className="font-mono text-xs text-stone-500">ID do Pix: {r.pixReference}</p>}
      {r.status === "REQUESTED" && !r.canApprove && <p className={ui.hint}>Esperando a aprovação da Gestão.</p>}
      {r.status === "APPROVED" && !r.canPay && <p className={ui.hint}>Aprovado: esperando o Pix do Pagamento.</p>}
      {r.status === "APPROVED" && r.remittance && (
        <p className="text-sm text-sky-800 dark:text-sky-300">
          Na remessa nº {r.remittance.nsa} (pagamento em {r.remittance.payDay.split("-").reverse().join("/")})
          {r.bankResult === "SCHEDULED" ? ": agendado no banco." : r.bankResult === "PENDING" ? ": pendente de assinatura no Internet Banking." : "."}
        </p>
      )}
      {r.status === "APPROVED" && !r.remittance && r.bankResult === "REJECTED" && <p className="text-sm text-red-700 dark:text-red-400">O banco recusou o Pix: {r.bankNote}. Corrija o cadastro; ele entra na próxima remessa.</p>}
      {(r.canApprove || r.canPay) && (
        <div data-tour="sq-pagar" className="flex flex-col gap-3 border-t border-stone-200/70 pt-4 dark:border-white/10">
          {r.canApprove && <ApproveForm withdrawalId={r.id} label={formatBRL(r.amountCents)} />}
          {r.canPay && <PayForm withdrawalId={r.id} label={formatBRL(r.amountCents)} />}
          {r.canPay && r.remittance && <RemoveRemessaForm withdrawalId={r.id} />}
          <RejectForm withdrawalId={r.id} />
          <p className="hidden items-center gap-1.5 text-[11px] text-stone-500 lg:flex"><Keyboard className="size-3.5" />{r.canApprove ? "A aprova" : "P marca pago"} · R recusa · ↑↓ passa de pedido · Esc fecha</p>
        </div>
      )}
    </>
  );
}

/** Quem tem saldo para saque e não pediu; pagos por mês; motivos de recusa. */
export function SaquesExtras({ board, canMessage }: { board: Board; canMessage: boolean }) {
  const [msg, setMsg] = useState(false);
  const max = Math.max(1, ...board.paidByMonth.map((m) => m.cents));
  const nr = board.notRequested;
  return (
    <div className="@container">
      <div className="grid gap-3 @4xl:grid-cols-3">
        <section className="liquid-tile flex flex-col gap-2 rounded-3xl p-4">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold"><MessageCircle className="size-4" />Ainda não pediram <span className="text-stone-500">{nr.length}</span></h3>
          <p className="text-xs text-stone-500">Têm saldo para saque e nenhum pedido aberto.</p>
          {nr.length === 0 ? (
            <p className="text-sm text-stone-500">Ninguém com saldo parado. 🎉</p>
          ) : (
            <>
              <ul className="flex max-h-48 flex-col gap-1 overflow-y-auto text-sm">
                {nr.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-2">
                    <Link href={`/admin/creators/${c.id}`} className="min-w-0 truncate hover:underline">{c.name}</Link>
                    <span className="shrink-0 font-semibold tabular-nums"><M>{formatBRL(c.availableCents)}</M></span>
                  </li>
                ))}
              </ul>
              {canMessage && <button type="button" onClick={() => setMsg(true)} className={`${ui.btnSm} mt-auto self-start`}><MessageCircle className="size-3.5" />Lembrar {nr.length === 1 ? "ela" : `as ${nr.length}`}</button>}
              {!board.window.open && <p className="text-[11px] text-stone-500">A janela está fechada: o lembrete faz mais sentido quando abrir (dia {board.days.start}).</p>}
            </>
          )}
        </section>
        <section className="liquid-tile flex flex-col gap-3 rounded-3xl p-4">
          <h3 className="text-sm font-semibold">Pagos por mês</h3>
          <div className="flex h-32 items-end gap-2">
            {board.paidByMonth.map((m) => (
              <div key={m.month} className="flex flex-1 flex-col items-center gap-1" title={`${formatBRL(m.cents)} · ${m.count} saques`}>
                <span className="text-[10px] tabular-nums text-stone-500">{m.cents ? shortBRL(m.cents) : ""}</span>
                <span className="w-full rounded-t-lg bg-brand/80 dark:bg-brand-2/80" style={{ height: `${Math.max(m.cents ? 6 : 2, Math.round((m.cents / max) * 88))}px` }} />
                <span className="text-[11px] text-stone-500">{MONTHS[Number(m.month.slice(5)) - 1]}</span>
              </div>
            ))}
          </div>
          <p className="text-xs text-stone-500">{board.paidByMonth.reduce((s, m) => s + m.count, 0)} saques pagos em 6 meses.</p>
        </section>
        <section className="liquid-tile flex flex-col gap-2 rounded-3xl p-4">
          <h3 className="text-sm font-semibold">Motivos de recusa</h3>
          <p className="text-xs text-stone-500">Os mais comuns nos últimos 6 meses: bom para orientar as creators.</p>
          {board.reasons.length === 0 ? (
            <p className="text-sm text-stone-500">Nenhuma recusa. 🎉</p>
          ) : (
            <ul className="flex flex-col gap-1.5 text-sm">
              {board.reasons.map((r) => (
                <li key={r.reason} className="flex items-start justify-between gap-2"><span className="min-w-0">{r.reason}</span><span className="shrink-0 rounded-full bg-stone-500/10 px-2 text-xs font-semibold tabular-nums">{r.count}</span></li>
              ))}
            </ul>
          )}
        </section>
      </div>
      {msg && <MessageSheet ids={nr.map((c) => c.id)} names={nr.map((c) => c.name)} {...REMIND} onClose={() => setMsg(false)} />}
    </div>
  );
}
