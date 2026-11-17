import { ArrowDownLeft, ArrowUpRight, BellRing, Check, ChevronRight, Clock, FileText, KeyRound, Receipt, TriangleAlert, Wallet, X } from "lucide-react";
import type { portalWithdrawalExtras } from "@/lib/portal/withdrawal-extras";
import { PixChange } from "./pix-change";
import { CopyButton } from "./copy-button";
import { PayCalendar } from "@/components/ui/pay-calendar";
import Link from "next/link";
import { formatBRL, monthNamePt, payDaysText, type WithdrawalDays } from "@/domain";
import { LEDGER_LABEL } from "@/lib/commission/statement";
import { CancelWithdrawalButton } from "./cancel-withdrawal";
import { NfDataList } from "./nf-data";
import { HelpTip } from "@/components/ui/tour";
import { releaseNote, releaseWhat } from "@/components/ui/release-progress";
import { WITHDRAWAL_BLOCK_TEXT, WITHDRAWAL_STATUS_LABEL, type WithdrawalBlock, type WithdrawalTab } from "@/lib/portal/withdrawals";

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const monthLabel = (m: string) => `${MONTHS[Number(m.slice(5)) - 1]}/${m.slice(2, 4)}`;
const day = (d: Date) => d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" });
/** Lançamentos agrupados pelo dia (do pagamento do pedido ou do lançamento), o mais recente primeiro. */
function byDay<T extends { orderPaidAt: Date | null; createdAt: Date }>(lines: readonly T[]): [string, T[]][] {
  const m = new Map<string, T[]>();
  for (const l of lines) {
    const k = (l.orderPaidAt ?? l.createdAt).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
    m.set(k, [...(m.get(k) ?? []), l]);
  }
  return [...m].sort((a, b) => (a[0] < b[0] ? 1 : -1));
}

const ORDER: WithdrawalBlock[] = ["VIEW_ONLY", "LOCKED", "OPEN_REQUEST", "OUTSIDE_WINDOW", "NOTHING_AVAILABLE"];

const STATUS_STYLE = {
  REQUESTED: "bg-amber-500/15 text-amber-800 dark:text-amber-300",
  APPROVED: "bg-sky-500/15 text-sky-800 dark:text-sky-300",
  PAID: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300",
  REJECTED: "bg-red-500/15 text-red-700 dark:text-red-300",
  CANCELLED: "bg-stone-500/15 text-stone-700 dark:text-stone-300",
} as const;

/** Aba Saque (D-WDTAB): saldo e botão, meus saques, movimentações por mês. Só exibe. */
export function WithdrawalView({ tab, base, justRequested = false, days, extras }: { tab: WithdrawalTab; base: string; justRequested?: boolean; /** D-REVITARULES */ days?: WithdrawalDays; extras: Awaited<ReturnType<typeof portalWithdrawalExtras>> }) {
  const { balance, policy } = tab;
  const block = ORDER.find((b) => tab.blocks.includes(b));
  const blockText = block
    ? WITHDRAWAL_BLOCK_TEXT[block]
        .replace("{start}", String(policy.windowStartDay))
        .replace("{end}", String(policy.windowEndDay))
        .replace("{what}", releaseWhat(tab.release))
        .replace("{min}", tab.release.minCents === null ? "o mínimo do contrato" : formatBRL(tab.release.minCents))
    : null;
  const st = tab.statement;
  // D-NFAMOUNT: com saldo liberado, o número do topo é o valor da nota do mês (prévia fora da janela).
  const showNf = balance.availableCents > 0 && !tab.blocks.includes("OPEN_REQUEST") && !tab.blocks.includes("LOCKED");
  const doc = tab.individual ? "recibo" : "nota";
  const heroLabel = !showNf ? "Disponível para saque" : extras.window.open ? `Valor da sua ${doc} deste mês` : `Valor previsto da sua próxima ${doc}`;

  return (
    <div className="flex flex-col gap-6">
      {justRequested && (
        <p role="status" className="rounded-2xl border border-emerald-400/50 bg-emerald-100/80 px-4 py-3 text-sm text-emerald-950 dark:bg-emerald-900/40 dark:text-emerald-100">
          Pedido de saque enviado! A equipe confere {tab.individual ? "o recibo" : "a nota fiscal"} e paga por Pix. Você acompanha em "Meus saques".
        </p>
      )}
      {/* D-PORTALWD: faixa com o saldo, o botão (ou o motivo), a janela e o que vem no dia 1. */}
      <section data-tour="saque-saldo" className="@container relative isolate overflow-hidden rounded-[32px] text-white shadow-[0_30px_60px_-34px_var(--brand)]">
        <div aria-hidden className="brand-art absolute inset-0 -z-10" />
        <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(80%_60%_at_50%_-20%,rgb(255_255_255/0.22),transparent_70%)]" />
        <div className="flex flex-col gap-4 p-5 md:p-7">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-white/75"><Wallet className="size-4" />{heroLabel} <HelpTip id="saque-saldo" className="-my-1" /></p>
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${extras.window.open ? "bg-emerald-400/25" : "bg-white/15"}`}>
              {extras.window.open ? `Janela aberta · ${extras.window.daysLeft === 1 ? "último dia" : `até o dia ${policy.windowEndDay}`}` : `Janela abre em ${extras.window.opensIn} ${extras.window.opensIn === 1 ? "dia" : "dias"} (dia ${policy.windowStartDay})`}
            </span>
          </div>
          <p className={`text-4xl font-semibold tabular-nums ${balance.availableCents < 0 ? "text-red-200" : ""}`}><span className="money">{formatBRL(balance.availableCents)}</span></p>
          {/* D-NFAMOUNT: o valor exato da nota (ou do recibo), para copiar. */}
          {showNf && (
            <div className="flex flex-wrap items-center gap-2 text-sm text-white/90">
              <span>{tab.individual ? "O recibo sai exatamente deste valor." : <>Emita a nota <strong>exatamente deste valor</strong>.</>}</span>
              <CopyButton value={(balance.availableCents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} label="Copiar valor" />
            </div>
          )}
          {blockText ? (
            <p className="rounded-2xl bg-white/15 px-4 py-3 text-sm">{blockText}</p>
          ) : (
            <Link href={`${base}/saque/novo`} className="self-start rounded-full bg-white px-6 py-3 text-sm font-semibold text-stone-900 shadow-sm">Solicitar saque</Link>
          )}
          {!extras.window.open && !tab.blocks.includes("VIEW_ONLY") && (
            <p className="flex items-center gap-2 text-xs text-white/85"><BellRing className="size-3.5 shrink-0" />Você recebe um aviso no dia {policy.windowStartDay}, aqui no portal e no WhatsApp, se tiver saldo para sacar.</p>
          )}
          <div className="grid grid-cols-2 gap-2">
            <div className="frost-tile flex min-w-0 flex-col rounded-2xl px-3 py-2.5 text-stone-900 dark:text-white">
              <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-300"><Clock className="size-3" />A liberar</span>
              <span className="truncate text-lg font-semibold tabular-nums"><span className="money">{formatBRL(balance.heldCents)}</span></span>
              <span className="truncate text-[11px] text-stone-500 dark:text-stone-300">{balance.heldCents > 0 ? releaseNote(tab.release) : "nada em espera"}</span>
            </div>
            <div className="frost-tile flex min-w-0 flex-col rounded-2xl px-3 py-2.5 text-stone-900 dark:text-white">
              <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-300"><FileText className="size-3" />Em saque</span>
              <span className="truncate text-lg font-semibold tabular-nums"><span className="money">{formatBRL(balance.reservedCents)}</span></span>
              <span className="truncate text-[11px] text-stone-500 dark:text-stone-300">pedidos em andamento</span>
            </div>
          </div>
          {tab.release.minCents !== null && balance.heldCents > 0 && (
            <p className="rounded-2xl bg-white/15 px-4 py-2.5 text-sm">
              {tab.release.accumulatedCents >= tab.release.minCents
                ? <>Em {day(tab.release.nextClosingAt)} libera <strong className="money">{formatBRL(balance.heldCents)}</strong>: você já bateu o mínimo.</>
                : <><strong className="money">{formatBRL(balance.heldCents)}</strong> libera quando a sua {releaseWhat(tab.release)} chegar a {formatBRL(tab.release.minCents)} (faltam {formatBRL(tab.release.minCents - tab.release.accumulatedCents)}).</>}
            </p>
          )}
        </div>
      </section>

      {(tab.nfAmount.lines.length > 0 || tab.nfAmount.next.length > 0) && <NfAmountCard tab={tab} doc={doc} />}

      {/* D-CALENDAR: as datas do mês dela (enviar a nota, receber, liberar a próxima comissão). */}
      <section className="@container glass flex flex-col gap-3 rounded-3xl p-5">
        <h2 className="font-semibold">Seu calendário do mês</h2>
        <PayCalendar month={tab.calendar.month} days={tab.calendar.days} normalEnd={tab.calendar.normalEnd} today={tab.calendar.today} who="creator" />
        {tab.calendar.extended && <p className="text-xs text-amber-800 dark:text-amber-300">Neste mês o prazo para enviar a {doc} foi estendido até o dia {tab.calendar.days.end}.</p>}
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="glass flex flex-col gap-1 rounded-3xl p-4 md:p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold"><KeyRound className="size-4" />Sua chave Pix</h2>
          <p className="font-mono text-lg">{extras.pixKey ?? "não cadastrada"}</p>
          <p className="text-xs text-stone-500">{extras.pixKey ? "O Pix do saque cai nesta chave." : "Você informa a chave no pedido de saque."}</p>
          {/* D-PIXCHANGE: ela mesma troca (a equipe também, na ficha). */}
          {extras.pixKey && !tab.blocks.includes("VIEW_ONLY") && <PixChange marca={base.split("/")[2]!} />}
        </section>
        <section className="glass flex flex-col gap-1 rounded-3xl p-4 md:p-5">
          <h2 className="text-sm font-semibold">Total recebido</h2>
          <p className="text-lg font-semibold tabular-nums"><span className="money">{formatBRL(extras.received.totalCents)}</span></p>
          <p className="text-xs text-stone-500">{extras.received.count} {extras.received.count === 1 ? "saque pago" : "saques pagos"} · em {extras.received.year}: <span className="money">{formatBRL(extras.received.yearCents)}</span></p>
        </section>
      </div>
      <p className="px-1 text-xs text-stone-500">
        {tab.release.minCents !== null &&
          `A comissão do mês é liberada no dia 1 do mês seguinte quando a sua ${releaseWhat(tab.release)} chega a ${formatBRL(tab.release.minCents)}; se não chegar, soma com a do mês seguinte. `}
        Pedido de saque do dia {policy.windowStartDay} ao {policy.windowEndDay}, sempre do valor total
        liberado, {tab.individual ? "com o recibo aceito no portal (pessoa física)" : "com a nota fiscal em PDF"} · pagamento por Pix {payDaysText(days)}.
      </p>

      {tab.individual ? (
        <section data-tour="saque-recibo" className="glass flex flex-col gap-3 rounded-3xl p-5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 font-semibold"><Receipt className="size-4" /> Você recebe como pessoa física</h2>
            <HelpTip id="saque-recibo" />
          </div>
          <p className="text-sm text-stone-600 dark:text-stone-400">
            Não precisa de nota fiscal. No pedido de saque você confere o recibo, digita nome completo e CPF e aceita. O Pix é feito na
            chave do seu cadastro.
          </p>
        </section>
      ) : (
      <section data-tour="saque-nf" className="glass flex flex-col gap-4 rounded-3xl p-5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 font-semibold"><Receipt className="size-4" /> Como pedir: 3 passos</h2>
          <HelpTip id="saque-nf" />
        </div>
        <ol className="flex flex-col gap-3">
          <li className="flex gap-3">
            <span className="grid size-7 shrink-0 place-content-center rounded-full bg-brand text-xs font-semibold text-white dark:bg-brand-2 dark:text-stone-900">1</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{balance.availableCents > 0 ? (<>Emita a nota fiscal de <strong className="money">{formatBRL(balance.availableCents)}</strong> (o valor total disponível), pelo CNPJ do seu cadastro, com estes dados:</>) : "Quando houver comissão liberada, emita a nota fiscal do valor total disponível (ele aparece aqui), pelo CNPJ do seu cadastro, com estes dados:"}</p>
              <div className="mt-2"><NfDataList nf={tab.nf} /></div>
            </div>
          </li>
          <li className="flex gap-3">
            <span className="grid size-7 shrink-0 place-content-center rounded-full bg-brand text-xs font-semibold text-white dark:bg-brand-2 dark:text-stone-900">2</span>
            <p className="text-sm font-medium">Baixe o PDF da nota no site da prefeitura (ou no emissor nacional).</p>
          </li>
          <li className="flex gap-3">
            <span className="grid size-7 shrink-0 place-content-center rounded-full bg-brand text-xs font-semibold text-white dark:bg-brand-2 dark:text-stone-900">3</span>
            <p className="text-sm font-medium">Toque em <strong>Solicitar saque</strong> e envie o PDF. O sistema confere a nota na hora e avisa se algo não bate.</p>
          </li>
        </ol>
        {extras.reasons.length > 0 && (
          <div className="rounded-2xl bg-amber-500/10 p-3 text-sm">
            <p className="flex items-center gap-1.5 font-semibold text-amber-900 dark:text-amber-200"><TriangleAlert className="size-4" />O que mais faz a nota voltar</p>
            <ul className="mt-1 list-disc pl-5 text-stone-700 dark:text-stone-300">{extras.reasons.map((r) => <li key={r.reason}>{r.reason}</li>)}</ul>
          </div>
        )}
      </section>
      )}

      <section data-tour="meus-saques" className="glass rounded-3xl p-5">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="font-semibold">Meus saques</h2>
          <HelpTip id="meus-saques" />
        </div>
        {tab.withdrawals.length === 0 ? (
          <p className="py-4 text-sm text-stone-500">Nenhum pedido de saque ainda.</p>
        ) : (
          <ul className="divide-y divide-stone-200/70 dark:divide-white/10">
            {tab.withdrawals.map((w) => {
              // D-PORTALWD: linha do tempo do pedido (pedido → aprovado → Pix feito, ou recusado/cancelado).
              const steps: { label: string; at: Date | null; state: "done" | "todo" | "bad" }[] =
                w.status === "REJECTED" || w.status === "CANCELLED"
                  ? [{ label: "Pedido", at: w.requestedAt, state: "done" }, { label: w.status === "REJECTED" ? "Recusado" : "Cancelado", at: w.decidedAt, state: "bad" }]
                  : [
                      { label: "Pedido", at: w.requestedAt, state: "done" },
                      { label: tab.individual ? "Recibo conferido" : "Nota conferida", at: w.approvedAt ?? (w.status === "PAID" ? w.decidedAt : null), state: w.approvedAt || w.status === "PAID" ? "done" : "todo" },
                      { label: "Pix feito", at: w.status === "PAID" ? w.decidedAt : null, state: w.status === "PAID" ? "done" : "todo" },
                    ];
              return (
                <li key={w.id} className="flex flex-col gap-2 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold tabular-nums"><span className="money">{formatBRL(w.amountCents)}</span></p>
                    <span className="flex items-center gap-1.5">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLE[w.status]}`}>{WITHDRAWAL_STATUS_LABEL[w.status]}</span>
                      {w.status === "REQUESTED" && !tab.blocks.includes("VIEW_ONLY") && <CancelWithdrawalButton marca={base.split("/")[2]!} withdrawalId={w.id} />}
                    </span>
                  </div>
                  <ol className="flex items-start">
                    {steps.map((st, i) => (
                      <li key={st.label} className="relative flex flex-1 flex-col items-center gap-1 text-center">
                        {i > 0 && <span aria-hidden className={`absolute right-1/2 top-2.5 h-0.5 w-full -translate-x-0 ${st.state === "todo" ? "bg-stone-300/70 dark:bg-white/10" : st.state === "bad" ? "bg-red-400/60" : "bg-brand/50"}`} style={{ right: "50%" }} />}
                        <span className={`relative z-10 grid size-5 place-content-center rounded-full ${st.state === "done" ? "bg-brand text-white dark:bg-brand-2 dark:text-stone-900" : st.state === "bad" ? "bg-red-500 text-white" : "border-2 border-stone-300 bg-white dark:border-white/20 dark:bg-stone-900"}`}>
                          {st.state === "done" && <Check className="size-3" />}
                          {st.state === "bad" && <X className="size-3" />}
                        </span>
                        <span className={`text-[11px] ${st.state === "todo" ? "text-stone-400" : "font-medium"}`}>{st.label}</span>
                        <span className="text-[10px] text-stone-500">{st.at ? day(st.at) : "—"}</span>
                      </li>
                    ))}
                  </ol>
                  {/* D-BANKREJECT: o banco devolveu o Pix; o saque segue aprovado e vai na próxima remessa. */}
                  {w.status === "APPROVED" && w.remittanceId === null && w.bankResult === "REJECTED" && (
                    <p role="alert" className="rounded-xl bg-amber-500/12 px-3 py-2 text-xs text-amber-900 dark:text-amber-200">
                      O banco devolveu este Pix{w.bankNote ? ` (${w.bankNote})` : ""}. Confira sua chave Pix acima e troque se precisar: o pagamento vai de novo na próxima remessa.
                    </p>
                  )}
                  {w.status === "REJECTED" && w.note && <p className="rounded-xl bg-red-500/10 px-3 py-2 text-xs text-red-800 dark:text-red-300">Motivo: {w.note}</p>}
                  {w.status === "PAID" && w.pixReference && <p className="font-mono text-[11px] text-stone-500">ID do Pix: {w.pixReference}</p>}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section data-tour="extrato" className="glass rounded-3xl p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-1 font-semibold">Movimentações <HelpTip id="extrato" /></h2>
          {st.months.length > 0 && (
            <nav aria-label="Mês" className="flex flex-wrap gap-2">
              {st.months.map((m) => (
                <Link key={m.month} href={`${base}/saque?mes=${m.month}`} className={`rounded-full px-3 py-1 text-xs ${m.month === st.month ? "bg-brand font-semibold text-white" : "glass"}`}>
                  {monthLabel(m.month)}
                </Link>
              ))}
            </nav>
          )}
        </div>
        {st.lines.length === 0 ? (
          <p className="py-4 text-sm text-stone-500">Nenhuma movimentação neste mês.</p>
        ) : (
          // Ajuste do responsável: cada dia numa linha (abre ao tocar; só o mais recente vem aberto), lançamentos em linhas finas.
          <ul className="-mx-5 divide-y divide-stone-200/70 border-y border-stone-200/70 dark:divide-white/10 dark:border-white/10">
            {byDay(st.lines).map(([dk, lines], gi) => (
              <li key={dk}>
                <details className="group/day" open={gi === 0}>
                  <summary className="flex cursor-pointer list-none items-center gap-2 px-5 py-3 hover:bg-stone-500/5">
                    <ChevronRight className="size-4 shrink-0 text-stone-400 transition group-open/day:rotate-90" />
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold">{dk.slice(8, 10)}/{dk.slice(5, 7)}</span>
                    <span className="shrink-0 text-xs text-stone-500">{lines.length} {lines.length === 1 ? "lançamento" : "lançamentos"}</span>
                    {(() => { const t = lines.reduce((a, l) => a + l.amountCents, 0); return <span className={`w-24 shrink-0 text-right text-sm font-semibold tabular-nums ${t < 0 ? "text-red-700 dark:text-red-400" : ""}`}><span className="money">{formatBRL(t)}</span></span>; })()}
                  </summary>
                  <ul className="border-t border-stone-200/60 bg-stone-500/[0.03] dark:border-white/10">
                    {lines.map((l) => (
                      <li key={l.id} className="flex items-center gap-2 py-2 pl-11 pr-5 text-sm">
                        {l.amountCents < 0 ? <ArrowDownLeft className="size-3.5 shrink-0 text-red-600" /> : <ArrowUpRight className="size-3.5 shrink-0 text-brand dark:text-brand-2" />}
                        <span className="min-w-0 flex-1 truncate">{LEDGER_LABEL[l.type]}{l.orderName && <span className="text-xs text-stone-500"> · {l.orderName}</span>}{l.held && <span className="text-xs text-amber-700 dark:text-amber-300"> · a liberar</span>}</span>
                        <span className={`w-20 shrink-0 text-right font-semibold tabular-nums ${l.amountCents < 0 ? "text-red-700 dark:text-red-400" : ""}`}><span className="money">{formatBRL(l.amountCents)}</span></span>
                      </li>
                    ))}
                  </ul>
                </details>
              </li>
            ))}
          </ul>
        )}
        {st.months.length > 0 && (
          <p className="mt-3 text-xs text-stone-500">
            Total de {monthLabel(st.month)}: {formatBRL(st.months.find((m) => m.month === st.month)?.totalCents ?? 0)}. Venda conta no mês do pagamento.
          </p>
        )}
      </section>
    </div>
  );
}

const brDay = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;

/** D-NFAMOUNT: de onde vem o valor da nota, linha a linha, e o que fica para a próxima. */
function NfAmountCard({ tab, doc }: { tab: WithdrawalTab; doc: string }) {
  const n = tab.nfAmount;
  const legacyTotal = n.legacy.reduce((s, l) => s + l.cents, 0);
  const opening = n.lines.find((l) => l.key === "OPENING_BALANCE");
  return (
    <section className="glass flex flex-col gap-3 rounded-3xl p-5">
      <h2 className="flex items-center gap-2 font-semibold"><Receipt className="size-4" /> De onde vem o valor da sua {doc}</h2>
      {n.lines.length > 0 && (
        <ul className="flex flex-col divide-y divide-stone-200/70 text-sm dark:divide-white/10">
          {n.lines.map((l) => (
            <li key={l.key} className="flex flex-col gap-1 py-2">
              <span className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2">{l.cents < 0 ? <ArrowUpRight className="size-3.5 text-stone-400" /> : <ArrowDownLeft className="size-3.5 text-emerald-600" />}{l.label}</span>
                <span className={`font-medium tabular-nums ${l.cents < 0 ? "text-stone-600 dark:text-stone-300" : ""}`}><span className="money">{l.cents < 0 ? `− ${formatBRL(-l.cents)}` : formatBRL(l.cents)}</span></span>
              </span>
              {l.key === "OPENING_BALANCE" && opening && legacyTotal === -opening.cents && n.legacy.length > 0 && (
                <span className="pl-5 text-xs text-stone-500">Pix que você já recebeu: {n.legacy.map((x) => `${brDay(x.day)} (${formatBRL(x.cents)})`).join(", ")}</span>
              )}
            </li>
          ))}
          <li className="flex items-center justify-between gap-3 pt-2.5 font-semibold">
            <span>= Valor da {doc}</span>
            <span className="tabular-nums"><span className="money">{formatBRL(n.totalCents)}</span></span>
          </li>
        </ul>
      )}
      {n.next.length > 0 && (
        <div className="rounded-2xl bg-stone-500/8 px-4 py-3 text-sm">
          <p className="font-medium">Fica para a próxima {doc}</p>
          {n.next.map((x) => (
            <p key={x.month} className="flex items-center justify-between gap-3 text-stone-600 dark:text-stone-300">
              <span>Comissão de {monthNamePt(x.month)} (libera no fechamento do mês)</span>
              <span className="tabular-nums"><span className="money">{formatBRL(x.cents)}</span></span>
            </p>
          ))}
        </div>
      )}
    </section>
  );
}
