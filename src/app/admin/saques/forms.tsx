"use client";

import { useActionState } from "react";
import { payAction, rejectAction, type ActionState } from "./actions";

const btn = "rounded border border-stone-300 px-2 py-1 text-xs font-semibold disabled:opacity-50";
const field = "rounded border border-stone-300 px-2 py-1 text-xs";

function Msg({ state }: { state: ActionState }) {
  if (state?.error) return <span role="alert" className="text-xs text-red-700">{state.error}</span>;
  if (state?.ok) return <span className="text-xs text-green-800">{state.ok}</span>;
  return null;
}

export function PayForm({ withdrawalId, label }: { withdrawalId: string; label: string }) {
  const [state, action, pending] = useActionState(payAction, undefined);
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm(`Confirmar que o Pix de ${label} foi feito?`)) e.preventDefault();
      }}
      className="inline-flex items-center gap-1"
    >
      <input type="hidden" name="withdrawalId" value={withdrawalId} />
      <button className={`${btn} bg-stone-800 text-white`} disabled={pending}>Marcar pago</button>
      <Msg state={state} />
    </form>
  );
}

export function RejectForm({ withdrawalId }: { withdrawalId: string }) {
  const [state, action, pending] = useActionState(rejectAction, undefined);
  return (
    <form action={action} className="flex flex-wrap items-center gap-1">
      <input type="hidden" name="withdrawalId" value={withdrawalId} />
      <input name="reason" required maxLength={300} placeholder="motivo (a creator vê)" className={`${field} w-56`} />
      <button className={`${btn} text-red-700`} disabled={pending}>Recusar</button>
      <Msg state={state} />
    </form>
  );
}
