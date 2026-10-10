"use client";

import { useActionState, useState } from "react";
import { Msg } from "@/components/ui/msg";
import { ui } from "@/components/ui/styles";
import { formatBRL } from "@/domain";
import { approveOpeningAction } from "./actions";

function toCents(v: string): number | null {
  const s = v.replace(/R\$|\s|\./g, "").replace(",", ".");
  if (s === "") return 0;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
}

/** Já pago + como foi pago, com o saldo que fica depois da abertura, e o botão de aprovar. */
const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const monthLabel = (m: string) => `${MONTHS[Number(m.slice(5)) - 1]}/${m.slice(2, 4)}`;
const plain = (cents: number) => (cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Sugestão vinda da planilha de pagamentos (D-LEGACYPAY): total e a descrição por mês. */
export function legacySuggestion(payments: { month: string; amountCents: number }[]) {
  if (payments.length === 0) return { paid: "", note: "" };
  const total = payments.reduce((s, p) => s + p.amountCents, 0);
  return {
    paid: plain(total),
    note: `Planilha Pagamentos influencers: ${payments.map((p) => `${monthLabel(p.month)} ${formatBRL(p.amountCents)}`).join(", ")}`,
  };
}

export function OpeningForm({
  creatorId,
  name,
  ledgerCents,
  legacyPayments = [],
}: {
  creatorId: string;
  name: string;
  ledgerCents: number;
  legacyPayments?: { month: string; amountCents: number }[];
}) {
  const [state, action, pending] = useActionState(approveOpeningAction, undefined);
  const suggestion = legacySuggestion(legacyPayments);
  const [paid, setPaid] = useState(suggestion.paid);
  const cents = toCents(paid);
  const after = cents === null ? null : ledgerCents - cents;
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm(`Aprovar a abertura de ${name} e liberar o saque? Saldo depois: ${after === null ? "?" : formatBRL(after)}.`)) e.preventDefault();
      }}
      className="flex flex-col gap-3"
    >
      <input type="hidden" name="creatorId" value={creatorId} />
      <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
        <label className={ui.label}>
          Já pago (R$)
          <input name="paid" value={paid} onChange={(e) => setPaid(e.target.value)} inputMode="decimal" placeholder="0,00" className={ui.input} />
        </label>
        <label className={ui.label}>
          Como foi pago
          <input name="note" maxLength={300} defaultValue={suggestion.note} placeholder="ex.: Pix 15/07 e 15/08" className={ui.input} />
        </label>
      </div>
      {legacyPayments.length > 0 && (
        <p className={ui.hint}>Preenchido com a planilha de pagamentos. Confira com os comprovantes antes de aprovar.</p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className={`text-sm ${after !== null && after < 0 ? "font-semibold text-red-700 dark:text-red-400" : "text-stone-600 dark:text-stone-400"}`}>
          Saldo depois: <strong className="tabular-nums">{after === null ? "valor inválido" : formatBRL(after)}</strong>
          {after !== null && after < 0 ? " · negativo: abate das próximas comissões" : ""}
        </span>
        <button className={ui.btn} disabled={pending || after === null}>Aprovar e liberar saque</button>
      </div>
      <Msg state={state} />
    </form>
  );
}
