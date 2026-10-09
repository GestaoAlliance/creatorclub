import { ArrowDownLeft, ArrowUpRight, Clock, FileText, Wallet } from "lucide-react";
import Link from "next/link";
import { formatBRL } from "@/domain";
import { LEDGER_LABEL } from "@/lib/commission/statement";
import { WITHDRAWAL_BLOCK_TEXT, WITHDRAWAL_STATUS_LABEL, type WithdrawalBlock, type WithdrawalTab } from "@/lib/portal/withdrawals";

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const monthLabel = (m: string) => `${MONTHS[Number(m.slice(5)) - 1]}/${m.slice(2, 4)}`;
const day = (d: Date) => d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" });
const ORDER: WithdrawalBlock[] = ["VIEW_ONLY", "LOCKED", "OPEN_REQUEST", "OUTSIDE_WINDOW", "BELOW_MIN"];

const STATUS_STYLE = {
  REQUESTED: "bg-amber-500/15 text-amber-800 dark:text-amber-300",
  PAID: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300",
  REJECTED: "bg-red-500/15 text-red-700 dark:text-red-300",
  CANCELLED: "bg-stone-500/15 text-stone-700 dark:text-stone-300",
} as const;

/** Aba Saque (D-WDTAB): saldo e botão, meus saques, movimentações por mês. Só exibe. */
export function WithdrawalView({ tab, base, justRequested = false }: { tab: WithdrawalTab; base: string; justRequested?: boolean }) {
  const { balance, policy } = tab;
  const block = ORDER.find((b) => tab.blocks.includes(b));
  const blockText = block
    ? WITHDRAWAL_BLOCK_TEXT[block]
        .replace("{start}", String(policy.windowStartDay))
        .replace("{end}", String(policy.windowEndDay))
        .replace("{min}", formatBRL(policy.minCents))
    : null;
  const st = tab.statement;

  return (
    <div className="flex flex-col gap-6">
      {justRequested && (
        <p role="status" className="rounded-2xl border border-emerald-400/50 bg-emerald-100/80 px-4 py-3 text-sm text-emerald-950 dark:bg-emerald-900/40 dark:text-emerald-100">
          Pedido de saque enviado! A equipe confere a nota fiscal e paga por Pix. Você acompanha em "Meus saques".
        </p>
      )}
      <section className="glass flex flex-col gap-5 rounded-3xl p-5 md:p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-stone-500"><Wallet className="size-4" /> Disponível para saque</p>
            <p className={`mt-1 text-4xl font-semibold tabular-nums ${balance.availableCents < 0 ? "text-red-700 dark:text-red-400" : ""}`}>{formatBRL(balance.availableCents)}</p>
          </div>
          {blockText ? (
            <span aria-disabled className="cursor-not-allowed rounded-full bg-stone-300/60 px-6 py-3 text-sm font-semibold text-stone-500 dark:bg-white/10">
              Solicitar saque
            </span>
          ) : (
            <Link href={`${base}/saque/novo`} className="rounded-full bg-brand px-6 py-3 text-sm font-semibold text-white shadow-sm">
              Solicitar saque
            </Link>
          )}
        </div>
        {blockText && <p className="rounded-2xl bg-white/50 px-4 py-3 text-sm text-stone-700 dark:bg-white/5 dark:text-stone-300">{blockText}</p>}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-white/40 px-4 py-3 dark:bg-white/5">
            <p className="flex items-center gap-1.5 text-xs text-stone-500"><Clock className="size-3.5" /> A liberar</p>
            <p className="mt-1 text-lg font-semibold tabular-nums">{formatBRL(balance.heldCents)}</p>
            <p className="text-xs text-stone-500">{tab.nextReleaseAt ? `próxima em ${day(tab.nextReleaseAt)}` : "nada em espera"}</p>
          </div>
          <div className="rounded-2xl bg-white/40 px-4 py-3 dark:bg-white/5">
            <p className="flex items-center gap-1.5 text-xs text-stone-500"><FileText className="size-3.5" /> Em saque</p>
            <p className="mt-1 text-lg font-semibold tabular-nums">{formatBRL(balance.reservedCents)}</p>
            <p className="text-xs text-stone-500">pedidos em análise</p>
          </div>
        </div>
        <p className="text-xs text-stone-500">
          Pedidos do dia {policy.windowStartDay} ao {policy.windowEndDay} de cada mês · mínimo {formatBRL(policy.minCents)} por pedido · pode pedir
          parte do saldo · nota fiscal em PDF · pagamento por Pix.
        </p>
      </section>

      <section className="glass rounded-3xl p-5">
        <h2 className="mb-2 font-semibold">Meus saques</h2>
        {tab.withdrawals.length === 0 ? (
          <p className="py-4 text-sm text-stone-500">Nenhum pedido de saque ainda.</p>
        ) : (
          <ul className="divide-y divide-stone-200/70 dark:divide-white/10">
            {tab.withdrawals.map((w) => (
              <li key={w.id} className="flex items-center justify-between gap-3 py-3">
                <div>
                  <p className="text-sm font-medium tabular-nums">{formatBRL(w.amountCents)}</p>
                  <p className="text-xs text-stone-500">
                    pedido em {day(w.requestedAt)}
                    {w.decidedAt && ` · concluído em ${day(w.decidedAt)}`}
                    {w.status === "REJECTED" && w.note && ` · ${w.note}`}
                  </p>
                </div>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLE[w.status]}`}>{WITHDRAWAL_STATUS_LABEL[w.status]}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="glass rounded-3xl p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold">Movimentações</h2>
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
          <ul className="divide-y divide-stone-200/70 dark:divide-white/10">
            {st.lines.map((l) => (
              <li key={l.id} className="flex items-center gap-3 py-3">
                <span className={`grid size-9 shrink-0 place-content-center rounded-2xl ${l.amountCents < 0 ? "bg-red-500/10 text-red-600" : "bg-brand/10 text-brand dark:bg-brand-2/15 dark:text-brand-2"}`}>
                  {l.amountCents < 0 ? <ArrowDownLeft className="size-4" /> : <ArrowUpRight className="size-4" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {LEDGER_LABEL[l.type]}
                    {l.orderName && <span className="text-stone-500"> · pedido {l.orderName}</span>}
                  </p>
                  <p className="text-xs text-stone-500">
                    {day(l.orderPaidAt ?? l.createdAt)}
                    {l.held && ` · libera em ${day(l.availableAt)}`}
                  </p>
                </div>
                <span className={`text-sm font-semibold tabular-nums ${l.amountCents < 0 ? "text-red-700 dark:text-red-400" : ""}`}>{formatBRL(l.amountCents)}</span>
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
