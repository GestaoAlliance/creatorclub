"use client";

import { AlertTriangle, CheckCircle2, Download, ExternalLink, FileText, History, MessageCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useMemo, useState } from "react";
import { formatBRL, monthNamePt, shortBRL, UNEXPLAINED } from "@/domain";
import { Msg } from "@/components/ui/msg";
import { PayCalendar } from "@/components/ui/pay-calendar";
import { ui } from "@/components/ui/styles";
import type { PayKind, payMonthBoard, PayRow, PayTab } from "@/lib/payouts/month-board";
import { Avatar } from "../../creators/list-parts";
import { MessageSheet, SidePanel } from "../../desempenho/parts";
import { payBatchAction } from "../../saques/actions";
import { ApproveForm, PayForm, RecheckForm, RejectForm, RemoveRemessaForm } from "../../saques/forms";

type Data = Awaited<ReturnType<typeof payMonthBoard>>;
const M = ({ children }: { children: React.ReactNode }) => <span className="money">{children}</span>;
const monthLabel = (m: string) => `${monthNamePt(m)} de ${m.slice(0, 4)}`;
const day = (d: Date | string | null) => (d ? new Date(d).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—");
const br = (d: string | null) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : "—");
const pct = (bps: number | null) => (bps === null ? "—" : `${(bps / 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`);

const TAB_LABEL: Record<PayTab, string> = { aprovar: "NF para aprovar", realizar: "Saques a realizar", realizados: "Saques realizados" };

const REMIND = {
  title: "Sua nota de comissão",
  body: "Oi, {nome}! Sua comissão do mês já está liberada no portal 💛\n\nEntre em *Saque*: o valor da nota está lá em destaque. Emita a nota exatamente desse valor e envie pelo portal até o dia {fim}. Qualquer dúvida, me chama!",
};

/** D-PAYFLOW: faixa com o mês e as 3 etapas (abas), e a lista da etapa. */
export function PayBoard({ brandName, kind, tipo, tab, data, canMessage, canPay, canEditCalendar = false }: { brandName: string; kind: PayKind; tipo: string; tab: PayTab; data: Data; canMessage: boolean; canPay: boolean; canEditCalendar?: boolean }) {
  const router = useRouter();
  const doc = kind === "CNPJ" ? "nota" : "recibo";
  const url = (t: PayTab, m = data.month) => `/admin/pagamentos/${tipo}?aba=${t}&mes=${m}`;
  const tiles: { t: PayTab; value: number; hint: string }[] = [
    { t: "aprovar", value: data.stages.aprovar.cents, hint: `${data.stages.aprovar.count} ${data.stages.aprovar.count === 1 ? `${doc} enviada` : `${doc}s enviadas`}${data.stages.aprovar.waiting ? ` · ${data.stages.aprovar.waiting} sem enviar` : ""}` },
    { t: "realizar", value: data.stages.realizar.cents, hint: `${data.stages.realizar.count} ${data.stages.realizar.count === 1 ? "aprovada esperando o Pix" : "aprovadas esperando o Pix"}` },
    { t: "realizados", value: data.stages.realizados.cents, hint: `${data.stages.realizados.count} ${data.stages.realizados.count === 1 ? "paga" : "pagas"}` },
  ];
  return (
    <>
      <section className="@container relative isolate overflow-hidden rounded-[32px] text-white shadow-[0_30px_60px_-34px_var(--brand)]">
        <div aria-hidden className="brand-art absolute inset-0 -z-10" />
        <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(80%_60%_at_50%_-20%,rgb(255_255_255/0.22),transparent_70%)]" />
        <div className="flex flex-col gap-5 p-5 md:p-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-white/70">{brandName}</p>
              <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Pagamentos {kind}</h1>
              <p className="mt-1 max-w-xl text-sm text-white/80">
                {kind === "CNPJ" ? "Creators com CNPJ: nota fiscal." : "Creators pessoa física: recibo aceito no portal."} Mês da comissão: a nota da janela de saque paga a comissão do mês anterior.
              </p>
            </div>
            <label className="flex flex-col gap-1 text-xs font-medium text-white/75">
              Mês da comissão
              <select value={data.month} onChange={(e) => router.push(url(tab, e.target.value))} className="rounded-full border border-white/30 bg-white/15 px-3 py-1.5 text-sm font-semibold text-white outline-none [&>option]:text-stone-900">
                {data.months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
              </select>
            </label>
          </div>
          <nav className="grid grid-cols-1 gap-2 @2xl:grid-cols-3" aria-label="Etapas">
            {tiles.map((x, i) => (
              <Link key={x.t} href={url(x.t)} aria-current={tab === x.t ? "page" : undefined} className={`seg-tile frost-tile flex min-w-0 flex-col items-start gap-0.5 rounded-2xl px-3.5 py-3 text-left text-stone-900 dark:text-white ${tab === x.t ? "is-on" : ""}`}>
                <span className="text-[11px] font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-300">{i + 1}. {kind === "CPF" && x.t === "aprovar" ? "Recibos para aprovar" : TAB_LABEL[x.t]}</span>
                <span className="text-2xl font-semibold tabular-nums leading-tight"><M>{shortBRL(x.value)}</M></span>
                <span className="text-[11px] text-stone-500 dark:text-stone-300">{x.hint}</span>
              </Link>
            ))}
          </nav>
        </div>
      </section>

      {/* D-CALENDAR: o mês com os prazos e "hoje". */}
      <details className="glass group rounded-3xl p-4 md:p-5" open={data.calendar.today >= data.calendar.days.start - 2 && data.calendar.today <= data.calendar.days.payBy}>
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-sm font-semibold">
          <span>Calendário do mês{data.calendar.extended ? ` · pedido estendido até o dia ${data.calendar.days.end}` : ""}</span>
          <span className="flex items-center gap-3 text-xs font-normal text-stone-500">
            {canEditCalendar && <Link href="/admin/marcas" className="underline" onClick={(e) => e.stopPropagation()}>Mudar datas</Link>}
            <span className="group-open:hidden">Ver</span><span className="hidden group-open:inline">Fechar</span>
          </span>
        </summary>
        <div className="@container mt-3"><PayCalendar month={data.calendar.month} days={data.calendar.days} normalEnd={data.calendar.normalEnd} today={data.calendar.today} /></div>
      </details>

      <PayList key={`${tab}-${data.month}`} kind={kind} tipo={tipo} tab={tab} data={data} canPay={canPay} />

      {tab === "aprovar" && data.waiting.length > 0 && <Waiting data={data} doc={doc} canMessage={canMessage} />}
    </>
  );
}

function PayList({ kind, tipo, tab, data, canPay }: { kind: PayKind; tipo: string; tab: PayTab; data: Data; canPay: boolean }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [state, action, pending] = useActionState(payBatchAction, undefined);
  const rows = data.rows;
  const payable = rows.filter((r) => r.canPay);
  const chosen = payable.filter((r) => sel.has(r.withdrawalId!));
  const open = useMemo(() => rows.find((r) => r.key === openId) ?? null, [rows, openId]);
  useEffect(() => {
    if (openId && !open) setOpenId(null);
  }, [openId, open]);
  useEffect(() => {
    if (state?.ok) setSel(new Set());
  }, [state]);
  const doc = kind === "CNPJ" ? "nota" : "recibo";
  const empty = tab === "aprovar" ? `Nenhum${kind === "CNPJ" ? "a nota" : " recibo"} para aprovar em ${monthLabel(data.month)}.` : tab === "realizar" ? `Nada esperando o Pix em ${monthLabel(data.month)}.` : `Nenhum pagamento de ${monthLabel(data.month)} ainda.`;
  const allOn = payable.length > 0 && chosen.length === payable.length;
  const csv = `/admin/pagamentos/${tipo}/planilha?aba=${tab}&mes=${data.month}${chosen.length ? `&ids=${chosen.map((r) => r.withdrawalId).join(",")}` : ""}`;

  return (
    <section className="@container glass overflow-hidden rounded-3xl !p-0">
      <header className="flex flex-wrap items-center gap-2 border-b border-stone-200/70 px-4 py-3 dark:border-white/10 md:px-5">
        <h2 className="mr-auto text-sm font-semibold">
          {kind === "CPF" && tab === "aprovar" ? "Recibos para aprovar" : TAB_LABEL[tab]} · {monthLabel(data.month)} <span className="font-normal text-stone-500">· {rows.length} · <M>{formatBRL(data.totals.nfCents)}</M></span>
        </h2>
        {tab === "realizar" && canPay && payable.length > 0 && (
          <button type="button" className={ui.ghostSm} onClick={() => setSel(allOn ? new Set() : new Set(payable.map((r) => r.withdrawalId!)))}>{allOn ? "Desmarcar todos" : "Selecionar todos"}</button>
        )}
        {rows.length > 0 && <a href={csv} className={ui.ghostSm}><Download className="size-3.5" />{chosen.length ? `Exportar ${chosen.length} selecionad${chosen.length === 1 ? "o" : "os"}` : "Exportar planilha"}</a>}
      </header>

      {rows.length === 0 ? (
        <p className="p-10 text-center text-sm text-stone-500">{empty}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="text-left text-[11px] uppercase tracking-wide text-stone-500">
              <tr className="border-b border-stone-200/70 dark:border-white/10">
                {tab === "realizar" && canPay && <th className="w-10 px-4 py-2" />}
                <th className="px-4 py-2 font-semibold">Nome completo</th>
                <th className="px-3 py-2 text-right font-semibold">Valor vendido</th>
                <th className="px-3 py-2 text-right font-semibold">% comissão</th>
                <th className="px-3 py-2 text-right font-semibold">Comissão do mês</th>
                <th className="px-3 py-2 text-right font-semibold">Valor da {doc}</th>
                <th className="px-4 py-2 font-semibold">{tab === "realizados" ? "Pago" : tab === "realizar" ? "Aprovado" : "Enviada"}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-200/70 dark:divide-white/10">
              {rows.map((r) => (
                <tr key={r.key} onClick={() => r.withdrawalId && setOpenId(r.key)} className={`align-top ${r.withdrawalId ? "cursor-pointer hover:bg-stone-500/5" : ""} ${openId === r.key ? "bg-brand/8" : ""}`}>
                  {tab === "realizar" && canPay && (
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      {r.canPay && <input type="checkbox" aria-label={`Selecionar ${r.name}`} checked={sel.has(r.withdrawalId!)} onChange={(e) => { const n = new Set(sel); if (e.target.checked) n.add(r.withdrawalId!); else n.delete(r.withdrawalId!); setSel(n); }} className="size-4 accent-[var(--brand)]" />}
                    </td>
                  )}
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-2.5">
                      <Avatar name={r.name} id={r.creatorId} />
                      <span className="min-w-0">
                        <span className="block font-medium">{r.name}</span>
                        {r.legacy && <span className="rounded-full bg-violet-500/12 px-2 py-0.5 text-[11px] font-medium text-violet-800 dark:text-violet-300">pago antes do Creator Club</span>}
                        {!r.legacy && tab === "aprovar" && r.nfCheck === "OK" && <span className="text-[11px] text-emerald-700 dark:text-emerald-300">nota conferida pelo sistema</span>}
                        {!r.legacy && tab === "aprovar" && r.nfCheck === "MANUAL" && <span className="text-[11px] text-amber-800 dark:text-amber-300">conferir a nota</span>}
                        {r.remittanceNsa !== null && <span className="text-[11px] text-sky-800 dark:text-sky-300">no banco · remessa {r.remittanceNsa}</span>}
                        {r.bankRejected && <span className="block text-[11px] font-medium text-red-700 dark:text-red-400">Banco recusou: {r.bankRejected}{r.pixChangedAfterBank ? " · chave trocada depois" : " · chave ainda não trocada"}</span>}
                      </span>
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">{r.legacy ? "—" : <M>{formatBRL(r.salesCents)}</M>}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{r.legacy ? "—" : pct(r.rateBps)}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{r.legacy ? "—" : <M>{formatBRL(r.commissionCents)}</M>}</td>
                  <td className="px-3 py-3 text-right">
                    <span className="block font-semibold tabular-nums"><M>{formatBRL(r.nfCents)}</M></span>
                    {r.diff.length > 0 && (
                      <span className="mt-0.5 block text-[11px] leading-snug text-amber-800 dark:text-amber-300">
                        {r.diff.map((d) => <span key={d.label} className={`block ${d.label === UNEXPLAINED ? "font-semibold text-red-700 dark:text-red-400" : ""}`}>{d.cents < 0 ? "− " : "+ "}<M>{formatBRL(Math.abs(d.cents))}</M> {d.label}</span>)}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-stone-600 dark:text-stone-300">
                    {tab === "realizados" ? (
                      <>
                        <span className="block">{br(r.paidDay)}{r.paidBy ? ` · ${r.paidBy}` : ""}</span>
                        {r.pixReference && <span className="block font-mono text-[11px] text-stone-500">Pix {r.pixReference}</span>}
                        {r.note && <span className="block text-[11px] text-stone-500">{r.note}</span>}
                      </>
                    ) : tab === "realizar" ? day(r.approvedAt) : day(r.requestedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-stone-200/70 font-semibold dark:border-white/10">
                {tab === "realizar" && canPay && <td />}
                <td className="px-4 py-3">Total</td>
                <td className="px-3 py-3 text-right tabular-nums"><M>{formatBRL(data.totals.salesCents)}</M></td>
                <td />
                <td className="px-3 py-3 text-right tabular-nums"><M>{formatBRL(data.totals.commissionCents)}</M></td>
                <td className="px-3 py-3 text-right tabular-nums"><M>{formatBRL(data.totals.nfCents)}</M></td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {tab === "realizar" && canPay && payable.length > 0 && (
        <form
          action={action}
          onSubmit={(e) => {
            if (!chosen.length || !confirm(`Confirmar que ${chosen.length === 1 ? "o Pix foi feito" : `os ${chosen.length} Pix foram feitos`} (total ${formatBRL(chosen.reduce((s, r) => s + r.nfCents, 0))})? O valor sai do saldo e a creator é avisada.`)) e.preventDefault();
          }}
          className="flex flex-wrap items-center gap-3 border-t border-stone-200/70 px-4 py-3 dark:border-white/10 md:px-5"
        >
          {chosen.map((r) => <input key={r.withdrawalId} type="hidden" name="ids" value={r.withdrawalId!} />)}
          <p className="mr-auto text-sm">Selecionados: <strong>{chosen.length}</strong> · <strong><M>{formatBRL(chosen.reduce((s, r) => s + r.nfCents, 0))}</M></strong></p>
          <button className={ui.btn} disabled={pending || chosen.length === 0}><CheckCircle2 className="size-4" />{pending ? "Salvando…" : "Pagamento feito"}</button>
          <div className="w-full"><Msg state={state} /></div>
        </form>
      )}

      {open && open.withdrawalId && (
        <SidePanel
          label={`Saque de ${open.name}`}
          onClose={() => setOpenId(null)}
          header={
            <span className="flex items-center gap-3">
              <span className="rounded-full ring-2 ring-white/60"><Avatar name={open.name} id={open.creatorId} size="lg" /></span>
              <span className="min-w-0">
                <span className="block truncate text-lg font-semibold leading-tight">{open.name}</span>
                <span className="block text-2xl font-semibold tabular-nums"><M>{formatBRL(open.nfCents)}</M></span>
                <span className="block text-xs text-white/80">Comissão de {monthLabel(data.month)}</span>
              </span>
            </span>
          }
        >
          <Panel r={open} doc={doc} month={data.month} />
        </SidePanel>
      )}
    </section>
  );
}

function Panel({ r, doc, month }: { r: PayRow; doc: string; month: string }) {
  return (
    <>
      <div className="grid grid-cols-3 gap-2 text-center">
        {[["Vendido", formatBRL(r.salesCents)], ["Comissão", pct(r.rateBps)], [`Comissão de ${monthNamePt(month)}`, formatBRL(r.commissionCents)]].map(([k, v]) => (
          <div key={k} className="liquid-tile rounded-2xl px-2 py-2.5">
            <span className="block text-[10px] font-medium uppercase tracking-wide text-stone-500">{k}</span>
            <span className="block text-sm font-semibold tabular-nums"><M>{v}</M></span>
          </div>
        ))}
      </div>
      <div className="liquid-tile flex flex-col gap-1 rounded-2xl px-3 py-2.5 text-sm">
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
          O banco devolveu este Pix: {r.bankRejected}. {r.pixChangedAfterBank ? "A chave já foi trocada depois disso; vai na próxima remessa." : <>Peça a chave certa à creator (ela troca na aba Saque do portal) ou troque na <Link href={`/admin/creators/${r.creatorId}`} className="underline">ficha</Link>, antes da próxima remessa.</>}
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

/** Quem tem comissão liberada e ainda não enviou a nota (só no mês da nota da janela). */
function Waiting({ data, doc, canMessage }: { data: Data; doc: string; canMessage: boolean }) {
  const [msg, setMsg] = useState(false);
  return (
    <section className="glass flex flex-col gap-3 rounded-3xl p-4 md:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold"><History className="size-4" />Ainda não enviaram {doc === "nota" ? "a nota" : "o recibo"} <span className="text-stone-500">· {data.waiting.length}</span></h2>
        {canMessage && <button type="button" onClick={() => setMsg(true)} className={ui.btnSm}><MessageCircle className="size-3.5" />Lembrar {data.waiting.length === 1 ? "ela" : `as ${data.waiting.length}`}</button>}
      </div>
      <p className="text-xs text-stone-500">Têm comissão liberada e nenhum pedido. O valor é o que a {doc} delas deve ter (o mesmo que aparece em destaque no portal).</p>
      <ul className="flex flex-col divide-y divide-stone-200/70 text-sm dark:divide-white/10">
        {data.waiting.map((c) => (
          <li key={c.id} className="flex items-center justify-between gap-3 py-2">
            <Link href={`/admin/creators/${c.id}`} className="flex min-w-0 items-center gap-2.5 hover:underline"><Avatar name={c.name} id={c.id} /><span className="truncate">{c.name}</span></Link>
            <span className="shrink-0 text-right">
              <span className="block font-semibold tabular-nums"><M>{formatBRL(c.nfCents)}</M></span>
              {c.nfCents !== c.commissionCents && <span className="block text-[11px] text-stone-500">comissão de {monthNamePt(data.month)}: <M>{formatBRL(c.commissionCents)}</M></span>}
            </span>
          </li>
        ))}
      </ul>
      {msg && <MessageSheet ids={data.waiting.map((c) => c.id)} names={data.waiting.map((c) => c.name)} title={REMIND.title} body={REMIND.body.replace("{fim}", String(data.window.end))} onClose={() => setMsg(false)} />}
    </section>
  );
}
