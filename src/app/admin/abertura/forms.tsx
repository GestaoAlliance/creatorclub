"use client";

import { useActionState, useState } from "react";
import { formatBRL } from "@/domain";
import { approveOpeningAction } from "./actions";

const field = "rounded border border-stone-300 px-2 py-1 text-xs";

function toCents(v: string): number | null {
  const s = v.replace(/R\$|\s|\./g, "").replace(",", ".");
  if (s === "") return 0;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
}

/** Já pago + observação, com o saldo que fica depois da abertura, e o botão de aprovar. */
export function OpeningForm({ creatorId, name, ledgerCents }: { creatorId: string; name: string; ledgerCents: number }) {
  const [state, action, pending] = useActionState(approveOpeningAction, undefined);
  const [paid, setPaid] = useState("");
  const cents = toCents(paid);
  const after = cents === null ? null : ledgerCents - cents;
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm(`Aprovar a abertura de ${name} e liberar o saque? Saldo depois: ${after === null ? "?" : formatBRL(after)}.`)) e.preventDefault();
      }}
      className="flex flex-col gap-1"
    >
      <input type="hidden" name="creatorId" value={creatorId} />
      <div className="flex flex-wrap items-center gap-1">
        <label className="text-xs">Já pago R$</label>
        <input name="paid" value={paid} onChange={(e) => setPaid(e.target.value)} inputMode="decimal" placeholder="0,00" className={`${field} w-24`} />
        <input name="note" maxLength={300} placeholder="como foi pago (ex.: Pix 15/07 e 15/08)" className={`${field} w-64`} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className={`text-xs ${after !== null && after < 0 ? "font-semibold text-red-700" : "text-stone-600"}`}>
          saldo depois: {after === null ? "valor inválido" : formatBRL(after)}
          {after !== null && after < 0 ? " · negativo: abate das próximas comissões" : ""}
        </span>
        <button className="rounded bg-stone-800 px-2 py-1 text-xs font-semibold text-white disabled:opacity-50" disabled={pending || after === null}>
          Aprovar e liberar saque
        </button>
        {state?.error && <span role="alert" className="text-xs text-red-700">{state.error}</span>}
        {state?.ok && <span className="text-xs text-green-800">{state.ok}</span>}
      </div>
    </form>
  );
}
