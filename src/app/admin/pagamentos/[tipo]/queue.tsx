"use client";

import { AlertTriangle, CalendarDays, CheckCircle2, ClipboardCopy, Download, ExternalLink, FileText, MessageCircle, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { formatBRL, monthNamePt, shortBRL, UNEXPLAINED } from "@/domain";
import { Msg } from "@/components/ui/msg";
import { ui } from "@/components/ui/styles";
import { PeriodPicker } from "@/components/staff/period-picker";
import type { PayKind, PayRow } from "@/lib/payouts/month-board";
import type { QueueItem, QueueStage } from "@/lib/payouts/queue";
import { Avatar } from "../../creators/list-parts";
import { MessageSheet, SidePanel } from "../../desempenho/parts";
import { payBatchAction } from "../../saques/actions";
import { ApproveForm, PayForm, RecheckForm, RejectForm, RemoveRemessaForm } from "../../saques/forms";
import { payCheckAction } from "./actions";

const M = ({ children }: { children: React.ReactNode }) => <span className="money">{children}</span>;
const pct = (bps: number | null) => (bps === null ? "sem taxa" : `${(bps / 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`);
const day = (d: Date | string | null) => (d ? new Date(d).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" }) : "—");
const br = (d: string | null) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : "—");

export type Filter = QueueStage | "abertos";

const LABEL: Record<QueueStage, string> = { conferir: "Conferir", pedir: "Esperando o pedido", aprovar: "Aprovar", pagar: "Pagar", pago: "Pagos" };
const CHIP: Record<QueueStage, string> = {
  conferir: "bg-amber-500/15 text-amber-900 dark:text-amber-200",
  pedir: "bg-stone-500/12 text-stone-700 dark:text-stone-300",
  aprovar: "bg-sky-500/15 text-sky-900 dark:text-sky-200",
  pagar: "bg-violet-500/15 text-violet-900 dark:text-violet-200",
  pago: "bg-emerald-500/15 text-emerald-900 dark:text-emerald-200",
};

const REMIND = {
  title: "Sua nota de comissão",
  body: "Oi, {nome}! Sua comissão do mês já está liberada no portal 💛\n\nEntre em *Saque*: o valor da nota está lá em destaque. Emita a nota exatamente desse valor e envie pelo portal até o dia {fim}. Qualquer dúvida, me chama!",
};

/** A mensagem para quem acabou de ser conferida e ainda não pediu (WhatsApp). */
function releaseMessage(kind: PayKind, month: string, cents: number) {
  const doc = kind === "CNPJ" ? "a nota fiscal, que tem que ser *exatamente*" : "o recibo, que tem que ser *exatamente*";
  return `Oi, {nome}! Tudo bem? 💛\n\nConferimos seu Creator Club e está tudo certo! Agora o pagamento é feito por lá: entre com seu login e senha e peça o saque da sua comissão de *${monthNamePt(month)}*.\n\nNo saque você envia ${doc} de *${formatBRL(cents)}* (a sua comissão de ${monthNamePt(month)}), para o financeiro aprovar.\n\nQualquer dúvida, me chama!`;
}

type Props = {
  brandName: string;
  kind: PayKind;
  tipo: string;
  items: QueueItem[];
  counts: Record<QueueStage, { count: number; cents: number }>;
  filter: Filter;
  month: string;
  today: { day: number; now: string; next: string | null };
  windowEnd: number;
  period: { key: string; label: string; today: string };
  can: { check: boolean; message: boolean; pay: boolean };
};

/** D-PAYQUEUE: Pagamentos CNPJ/CPF numa fila só, cada creator na etapa dela, com a próxima ação. */
export function PayQueue({ brandName, kind, tipo, items, counts, filter, month, today, windowEnd, period, can }: Props) {
  const doc = kind === "CNPJ" ? "nota" : "recibo";
  const base = `/admin/pagamentos/${tipo}`;
  const url = (f: Filter) => (f === "abertos" ? base : f === "pago" ? `${base}?etapa=pago&p=${encodeURIComponent(period.key)}` : `${base}?etapa=${f}`);
  const shown = filter === "abertos" ? items.filter((i) => i.stage !== "pago") : items.filter((i) => i.stage === filter);
  const tiles: QueueStage[] = ["conferir", "pedir", "aprovar", "pagar", "pago"];
  const hint: Record<QueueStage, string> = {
    conferir: "vendas × % = valor no sistema",
    pedir: `conferidas, sem pedir a ${doc}`,
    aprovar: `${doc} enviada, falta aprovar`,
    pagar: "aprovados, falta o Pix",
    pago: `Pix em ${period.label.toLowerCase()}`,
  };
  return (
    <>
      <section className="@container relative isolate overflow-hidden rounded-[32px] text-white shadow-[0_30px_60px_-34px_var(--brand)]">
        <div aria-hidden className="brand-art absolute inset-0 -z-10" />
        <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(80%_60%_at_50%_-20%,rgb(255_255_255/0.22),transparent_70%)]" />
        <div className="flex flex-col gap-4 p-5 md:p-7">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-white/70">{brandName} · {kind === "CNPJ" ? "nota fiscal" : "recibo"}</p>
              <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Pagamentos {kind}</h1>
              <p className="mt-1 flex items-start gap-1.5 text-sm text-white/85">
                <CalendarDays className="mt-0.5 size-4 shrink-0" />
                <span>Hoje (dia {today.day}): {today.now}{today.next ? ` · depois: ${today.next.charAt(0).toLowerCase()}${today.next.slice(1)}` : ""}</span>
              </p>
            </div>
          </div>
          <nav className="grid grid-cols-2 gap-2 @2xl:grid-cols-3 @5xl:grid-cols-5" aria-label="Etapas">
            {tiles.map((s, i) => (
              <Link key={s} href={filter === s ? url("abertos") : url(s)} aria-current={filter === s ? "page" : undefined} className={`seg-tile frost-tile flex min-w-0 flex-col items-start gap-0.5 rounded-2xl px-3.5 py-3 text-left text-stone-900 dark:text-white ${filter === s ? "is-on" : ""} ${s === "pago" ? "col-span-2 @2xl:col-span-1" : ""}`}>
                <span className="text-[11px] font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-300">{s === "pago" ? "" : `${i + 1}. `}{LABEL[s]}</span>
                <span className="text-2xl font-semibold tabular-nums leading-tight">{counts[s].count}</span>
                <span className="text-[11px] text-stone-500 dark:text-stone-300"><M>{shortBRL(counts[s].cents)}</M> · {hint[s]}</span>
              </Link>
            ))}
          </nav>
        </div>
      </section>

      <List key={`${filter}-${period.key}`} {...{ brandName, kind, tipo, items: shown, filter, month, windowEnd, period, can, doc, back: url("abertos") }} />
    </>
  );
}

function List({ brandName, kind, tipo, items, filter, month, windowEnd, period, can, doc, back }: Omit<Props, "counts" | "today"> & { doc: string; back: string }) {
  const router = useRouter();
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [res, setRes] = useState<{ key: string; ok?: string; error?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);
  const [msg, setMsg] = useState<{ ids: string[]; names: string[]; title: string; body: string } | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [state, batch, paying] = useActionState(payBatchAction, undefined);
  useEffect(() => {
    if (state?.ok) setSel(new Set());
  }, [state]);
  const open = useMemo(() => items.find((i) => i.key === openKey) ?? null, [items, openKey]);
  const payable = items.filter((i) => i.stage === "pagar" && i.pay?.canPay);
  const chosen = payable.filter((i) => sel.has(i.pay!.withdrawalId!));
  const waiting = items.filter((i) => i.stage === "pedir");
  const total = items.reduce((t, i) => t + i.cents, 0);
  const csvTab = filter === "aprovar" ? "aprovar" : filter === "pagar" ? "realizar" : filter === "pago" ? "realizados" : null;

  const check = async (i: QueueItem, status: "CHECKED" | "REVIEW") => {
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    const out = await payCheckAction(i.creatorId, status, brandName);
    sending.current = false;
    setBusy(false);
    if (out.error) return setRes({ key: i.key, error: out.error });
    if (out.text) {
      try {
        await navigator.clipboard.writeText(out.text);
      } catch {}
      setRes({ key: i.key, ok: out.ok! });
    } else if (out.amountCents !== undefined && !out.requested && can.message) {
      setMsg({ ids: [i.creatorId], names: [i.name], title: "Seu saque está liberado", body: releaseMessage(kind, out.month!, out.amountCents) });
      setRes({ key: i.key, ok: "Conferido. Mande a mensagem para ela pedir o saque." });
    } else {
      setRes({ key: i.key, ok: out.requested ? "Conferido: o pedido dela já pode ser aprovado." : "Conferido." });
    }
    router.refresh();
  };

  const title = filter === "abertos" ? "Em aberto" : LABEL[filter];
  return (
    <section className="@container glass overflow-hidden rounded-3xl !p-0">
      <header className="flex flex-wrap items-center gap-2 border-b border-stone-200/70 px-4 py-3 dark:border-white/10 md:px-5">
        <h2 className="mr-auto text-sm font-semibold">
          {title}
          {filter === "pago" ? ` · ${period.label}` : ""} <span className="font-normal text-stone-500">· {items.length} · <M>{formatBRL(total)}</M></span>
          {filter !== "abertos" && <Link href={back} className="ml-2 text-xs font-normal text-stone-500 underline">ver tudo em aberto</Link>}
        </h2>
        {filter === "pago" && <PeriodPicker value={period.key} today={period.today} />}
        {(filter === "pedir" || filter === "abertos") && can.message && waiting.length > 1 && (
          <button type="button" className={ui.ghostSm} onClick={() => setMsg({ ids: waiting.map((i) => i.creatorId), names: waiting.map((i) => i.name), title: REMIND.title, body: REMIND.body.replace("{fim}", String(windowEnd)) })}>
            <MessageCircle className="size-3.5" />Lembrar as {waiting.length} que não pediram
          </button>
        )}
        {filter === "pagar" && can.pay && payable.length > 1 && (
          <button type="button" className={ui.ghostSm} onClick={() => setSel(chosen.length === payable.length ? new Set() : new Set(payable.map((i) => i.pay!.withdrawalId!)))}>
            {chosen.length === payable.length ? "Desmarcar todos" : "Selecionar todos"}
          </button>
        )}
        {csvTab && items.length > 0 && <a href={`/admin/pagamentos/${tipo}/planilha?aba=${csvTab}&p=${encodeURIComponent(period.key)}`} className={ui.ghostSm}><Download className="size-3.5" />Planilha</a>}
      </header>

      {items.length === 0 ? (
        <p className="p-10 text-center text-sm text-stone-500">{filter === "abertos" ? "Nada em aberto. 🎉" : `Ninguém em "${title}".`}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-stone-200/70 dark:divide-white/10">
          {items.map((i) => (
            <li key={i.key} className="flex flex-col gap-1.5 px-4 py-3 md:px-5">
              <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 @3xl:grid-cols-[auto_minmax(0,1fr)_8rem_10rem_minmax(0,12rem)]">
                {filter === "pagar" && can.pay ? (
                  <input type="checkbox" disabled={!i.pay?.canPay} aria-label={`Selecionar ${i.name}`} checked={!!i.pay?.withdrawalId && sel.has(i.pay.withdrawalId)} onChange={(e) => { const n = new Set(sel); if (e.target.checked) n.add(i.pay!.withdrawalId!); else n.delete(i.pay!.withdrawalId!); setSel(n); }} className="size-4 accent-[var(--brand)]" />
                ) : (
                  <Avatar name={i.name} id={i.creatorId} />
                )}
                <span className="min-w-0">
                  <Link prefetch={false} href={`/admin/creators/${i.creatorId}`} className="block truncate font-medium hover:underline">{i.name}</Link>
                  <Sub i={i} doc={doc} />
                </span>
                <span className="text-right font-semibold tabular-nums"><M>{formatBRL(i.cents)}</M></span>
                <span className="col-span-3 flex flex-wrap items-center justify-between gap-2 @3xl:contents">
                  <span>
                    <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-semibold ${CHIP[i.stage]}`}>{i.stage === "aprovar" ? `Aprovar ${doc}` : i.stage === "pago" ? "Pago" : LABEL[i.stage]}</span>
                  </span>
                  <span className="flex flex-wrap items-center justify-end gap-2">
                    <Action i={i} can={can} busy={busy} onCheck={check} onOpen={() => setOpenKey(i.key)}
                      onRemind={() => setMsg({ ids: [i.creatorId], names: [i.name], title: REMIND.title, body: REMIND.body.replace("{fim}", String(windowEnd)) })} />
                  </span>
                </span>
              </div>
              {res?.key === i.key && (res.ok || res.error) && <p role="status" className={`ml-11 text-xs ${res.error ? "text-red-700" : "text-emerald-700 dark:text-emerald-300"}`}>{res.error ?? res.ok}</p>}
            </li>
          ))}
        </ul>
      )}

      {filter === "pagar" && can.pay && payable.length > 0 && (
        <form
          action={batch}
          onSubmit={(e) => {
            if (!chosen.length || !confirm(`Confirmar que ${chosen.length === 1 ? "o Pix foi feito" : `os ${chosen.length} Pix foram feitos`} à mão (total ${formatBRL(chosen.reduce((s, i) => s + i.cents, 0))})? O valor sai do saldo e a creator é avisada.`)) e.preventDefault();
          }}
          className="flex flex-wrap items-center gap-3 border-t border-stone-200/70 px-4 py-3 dark:border-white/10 md:px-5"
        >
          {chosen.map((i) => <input key={i.key} type="hidden" name="ids" value={i.pay!.withdrawalId!} />)}
          <p className="mr-auto text-sm">Pix feito à mão? Marque e confirme: <strong>{chosen.length}</strong> · <strong><M>{formatBRL(chosen.reduce((s, i) => s + i.cents, 0))}</M></strong></p>
          <button className={ui.btnSm} disabled={paying || chosen.length === 0}><CheckCircle2 className="size-4" />{paying ? "Salvando…" : "Pagamento feito"}</button>
          <div className="w-full"><Msg state={state} /></div>
        </form>
      )}

      {open?.pay?.withdrawalId && (
        <SidePanel
          label={`Saque de ${open.name}`}
          onClose={() => setOpenKey(null)}
          header={
            <span className="flex items-center gap-3">
              <span className="rounded-full ring-2 ring-white/60"><Avatar name={open.name} id={open.creatorId} size="lg" /></span>
              <span className="min-w-0">
                <span className="block truncate text-lg font-semibold leading-tight">{open.name}</span>
                <span className="block text-2xl font-semibold tabular-nums"><M>{formatBRL(open.pay.nfCents)}</M></span>
                {open.pay.month && <span className="block text-xs text-white/80">Comissão de {monthNamePt(open.pay.month)}</span>}
              </span>
            </span>
          }
        >
          {open.stage === "conferir" && <p className="rounded-2xl bg-amber-500/12 px-3 py-2.5 text-sm text-amber-900 dark:text-amber-200">Confira antes (botão Conferido na fila): o pedido só pode ser aprovado depois.</p>}
          <Panel r={open.stage === "conferir" ? { ...open.pay, canApprove: false } : open.pay} doc={doc} month={open.pay.month ?? month} />
        </SidePanel>
      )}
      {msg && <MessageSheet ids={msg.ids} names={msg.names} title={msg.title} body={msg.body} onClose={() => setMsg(null)} />}
    </section>
  );
}

/** A linha de baixo do nome: o que importa naquela etapa. */
function Sub({ i, doc }: { i: QueueItem; doc: string }) {
  const c = i.check;
  const p = i.pay;
  const small = "block text-[11px] leading-snug";
  if (i.stage === "conferir" && c) {
    const review = c.check?.status === "REVIEW" && !c.check.stale;
    const diff = c.expectedCents === null ? null : c.systemCents - c.expectedCents;
    return (
      <>
        <span className={`${small} text-stone-500`}>
          Vendas de {monthNamePt(c.month).slice(0, 3)} <M>{formatBRL(c.salesCents)}</M> × {pct(c.rateBps)} = {c.expectedCents === null ? "—" : <M>{formatBRL(c.expectedCents)}</M>}
          {c.withdrawal ? " · já pediu o saque" : ""}
        </span>
        {review ? (
          <span className={`${small} font-medium text-amber-800 dark:text-amber-300`}>Em análise com o Pedro desde {day(c.check!.at)}</span>
        ) : c.matches ? (
          <span className={`${small} font-medium text-emerald-700 dark:text-emerald-300`}>Bate com o sistema{c.check?.stale ? " · o valor mudou desde a última conferência" : ""}</span>
        ) : (
          <span className={`${small} font-medium text-red-700 dark:text-red-400`}>
            <AlertTriangle className="mr-0.5 inline size-3" />Não bate{diff !== null ? <>: {diff > 0 ? "+" : "−"} <M>{formatBRL(Math.abs(diff))}</M></> : ""}
            {c.reasons.map((x) => <span key={x.label} className="block font-normal text-amber-800 dark:text-amber-300"><Search className="mr-1 inline size-3" />{x.cents < 0 ? "−" : "+"} <M>{formatBRL(Math.abs(x.cents))}</M> {x.label}</span>)}
          </span>
        )}
        {!c.hasPix && <span className={`${small} font-medium text-amber-800 dark:text-amber-300`}>sem chave Pix</span>}
      </>
    );
  }
  if (i.stage === "pedir" && c) {
    return (
      <span className={`${small} text-stone-500`}>
        Conferido{c.check?.by ? ` por ${c.check.by.split(" ")[0]}` : ""} {c.check ? day(c.check.at) : ""} · ainda não pediu
        {!c.hasPix && <span className="ml-1 font-medium text-amber-800 dark:text-amber-300">· sem chave Pix</span>}
      </span>
    );
  }
  if (!p) return null;
  const odd = p.diff.some((d) => d.label === UNEXPLAINED);
  return (
    <>
      {i.stage === "aprovar" && (
        <span className={`${small} ${p.nfCheck === "MANUAL" ? "font-medium text-amber-800 dark:text-amber-300" : "text-stone-500"}`}>
          Pedido em {day(p.requestedAt)} · {p.nfCheck === "OK" ? `${doc} conferida pelo sistema` : p.nfCheck === "MANUAL" ? `conferir a ${doc} na mão` : `${doc} enviada`}
        </span>
      )}
      {i.stage === "pagar" && (
        <span className={`${small} text-stone-500`}>
          Aprovado em {day(p.approvedAt)}
          {p.remittanceNsa !== null && <span className="font-medium text-sky-800 dark:text-sky-300"> · no banco (remessa {p.remittanceNsa})</span>}
        </span>
      )}
      {i.stage === "pago" && (
        <span className={`${small} text-stone-500`}>
          {p.legacy ? "Pago antes do Creator Club" : "Pago"} em {br(p.paidDay)}{p.paidBy ? ` por ${p.paidBy.split(" ")[0]}` : ""}{p.pixReference ? ` · Pix ${p.pixReference}` : ""}
        </span>
      )}
      {p.bankRejected && <span className={`${small} font-medium text-red-700 dark:text-red-400`}>Banco recusou: {p.bankRejected}{p.pixChangedAfterBank ? " · chave trocada depois" : " · chave ainda não trocada"}</span>}
      {odd && <span className={`${small} font-semibold text-red-700 dark:text-red-400`}>A conta não fecha: abra antes de aprovar ou pagar</span>}
    </>
  );
}

/** O botão da próxima ação. */
function Action({ i, can, busy, onCheck, onOpen, onRemind }: { i: QueueItem; can: Props["can"]; busy: boolean; onCheck: (i: QueueItem, s: "CHECKED" | "REVIEW") => void; onOpen: () => void; onRemind: () => void }) {
  const c = i.check;
  const p = i.pay;
  if (i.stage === "conferir" && c) {
    const review = c.check?.status === "REVIEW" && !c.check.stale;
    return (
      <>
        {p?.withdrawalId && <button type="button" onClick={onOpen} className={ui.ghostSm}><FileText className="size-3.5" />Ver</button>}
        {can.check && !c.matches && !review && <button type="button" disabled={busy} onClick={() => onCheck(i, "REVIEW")} className={ui.ghostSm}><ClipboardCopy className="size-3.5" />Mandar para o Pedro</button>}
        {can.check && <button type="button" disabled={busy} onClick={() => onCheck(i, "CHECKED")} className={c.matches ? ui.btnSm : ui.ghostSm}>Conferido</button>}
      </>
    );
  }
  if (i.stage === "pedir") return can.message ? <button type="button" onClick={onRemind} className={ui.ghostSm}><MessageCircle className="size-3.5" />Lembrar</button> : null;
  if (!p?.withdrawalId) return null;
  if (i.stage === "aprovar" && p.canApprove) return <button type="button" onClick={onOpen} className={ui.btnSm}>Ver e aprovar</button>;
  if (i.stage === "pagar" && p.canPay) return <button type="button" onClick={onOpen} className={ui.btnSm}>Pagar</button>;
  return <button type="button" onClick={onOpen} className={ui.ghostSm}>Ver</button>;
}

function Panel({ r, doc, month }: { r: PayRow; doc: string; month: string }) {
  return (
    <>
      <div className="liquid-tile flex flex-col gap-1 rounded-2xl px-3 py-2.5 text-sm">
        <span className="flex justify-between text-stone-500"><span>Vendas de {monthNamePt(month)} × {pct(r.rateBps)}</span><span className="tabular-nums"><M>{formatBRL(r.salesCents)}</M></span></span>
        <span className="flex justify-between"><span>Comissão de {monthNamePt(month)}</span><span className="tabular-nums"><M>{formatBRL(r.commissionCents)}</M></span></span>
        {r.diff.map((d) => <span key={d.label} className={`flex justify-between ${d.label === UNEXPLAINED ? "font-semibold text-red-700 dark:text-red-400" : "text-amber-800 dark:text-amber-300"}`}><span>{d.cents < 0 ? "−" : "+"} {d.label}</span><span className="tabular-nums"><M>{formatBRL(Math.abs(d.cents))}</M></span></span>)}
        <span className="flex justify-between border-t border-stone-200/70 pt-1 font-semibold dark:border-white/10"><span>= Valor da {doc}</span><span className="tabular-nums"><M>{formatBRL(r.nfCents)}</M></span></span>
      </div>
      {r.diff.some((d) => d.label === UNEXPLAINED) && (
        <p className="flex items-start gap-2 rounded-2xl bg-red-500/10 p-3 text-sm text-red-800 dark:text-red-300"><AlertTriangle className="mt-0.5 size-4 shrink-0" />A conta não fecha com o valor pedido: confira o extrato da creator antes de aprovar ou pagar.</p>
      )}
      {(r.document || r.pixKey) && (
        <div className="liquid-tile rounded-2xl px-3 py-2.5 text-sm">
          {r.document && <span className="block text-xs text-stone-500">{doc === "nota" ? "CNPJ" : "CPF"}: {r.document}</span>}
          {r.pixKey && <span className="block font-mono font-semibold">Pix: {r.pixKey}</span>}
        </div>
      )}
      {r.hasNf && (
        <div className="flex flex-col gap-1.5">
          <span className="flex items-center justify-between">
            <span className="text-[11px] font-medium uppercase tracking-wide text-stone-500">Nota fiscal</span>
            <span className="flex items-center gap-1.5">
              {r.canApprove && <RecheckForm withdrawalId={r.withdrawalId!} />}
              <a href={`/admin/saques/nf/${r.withdrawalId}`} target="_blank" rel="noopener noreferrer" className={ui.ghostSm}><ExternalLink className="size-3.5" />Abrir</a>
            </span>
          </span>
          <iframe key={r.withdrawalId} src={`/admin/saques/nf/${r.withdrawalId}`} title={`Nota de ${r.name}`} className="h-80 w-full rounded-2xl border border-stone-200/70 bg-white dark:border-white/10" />
        </div>
      )}
      {doc === "recibo" && <a href={`/admin/saques/recibo/${r.withdrawalId}`} target="_blank" rel="noopener noreferrer" className={`${ui.ghostSm} self-start`}><FileText className="size-3.5" />Recibo</a>}
      <p className="text-xs text-stone-500">Pedido em {day(r.requestedAt)}{r.approvedAt ? ` · aprovado em ${day(r.approvedAt)}` : ""}{r.paidDay ? ` · pago em ${br(r.paidDay)}${r.paidBy ? ` por ${r.paidBy}` : ""}` : ""}</p>
      {r.pixReference && <p className="font-mono text-xs text-stone-500">ID do Pix: {r.pixReference}</p>}
      {r.bankRejected && (
        <p role="alert" className="rounded-2xl bg-red-500/10 px-3 py-2.5 text-sm text-red-800 dark:text-red-300">
          O banco devolveu este Pix: {r.bankRejected}. {r.pixChangedAfterBank ? "A chave já foi trocada depois disso; vai na próxima remessa." : <>Peça a chave certa à creator (ela troca na aba Saque do portal) ou troque na <Link prefetch={false} href={`/admin/creators/${r.creatorId}`} className="underline">ficha</Link>, antes da próxima remessa.</>}
        </p>
      )}
      {r.inBank && (
        <div className="flex flex-col gap-2 border-t border-stone-200/70 pt-4 dark:border-white/10">
          <p className="text-sm text-sky-800 dark:text-sky-300">No banco (remessa nº {r.remittanceNsa}): este saque é dado como pago quando você sobe o retorno do SICOOB. Não faça Pix à mão.</p>
          <RemoveRemessaForm withdrawalId={r.withdrawalId!} />
        </div>
      )}
      {(r.canApprove || r.canPay) && (
        <div className="flex flex-col gap-3 border-t border-stone-200/70 pt-4 dark:border-white/10">
          {r.canApprove && <ApproveForm withdrawalId={r.withdrawalId!} label={formatBRL(r.nfCents)} />}
          {r.canPay && <PayForm withdrawalId={r.withdrawalId!} label={formatBRL(r.nfCents)} />}
          <RejectForm withdrawalId={r.withdrawalId!} />
        </div>
      )}
    </>
  );
}
