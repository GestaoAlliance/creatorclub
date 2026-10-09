"use client";

import { useActionState } from "react";
import { cancelWithdrawalAction } from "@/app/portal/[marca]/saque/actions";

/** "Cancelar pedido" enquanto o saque está em análise (ex.: mandou a nota errada e quer pedir de novo). */
export function CancelWithdrawalButton({ marca, withdrawalId }: { marca: string; withdrawalId: string }) {
  const [state, action, pending] = useActionState(cancelWithdrawalAction, undefined);
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm("Cancelar este pedido de saque? Você pode pedir de novo dentro da janela do mês.")) e.preventDefault();
      }}
      className="flex flex-col items-end gap-1"
    >
      <input type="hidden" name="marca" value={marca} />
      <input type="hidden" name="withdrawalId" value={withdrawalId} />
      <button disabled={pending} className="text-xs font-medium text-stone-500 underline underline-offset-2 disabled:opacity-60">
        {pending ? "Cancelando…" : "Cancelar pedido"}
      </button>
      {state?.error && <span role="alert" className="text-xs text-red-700 dark:text-red-400">{state.error}</span>}
    </form>
  );
}
