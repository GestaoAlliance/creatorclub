"use client";

import { useActionState } from "react";
import { confirmReceivedAction } from "@/app/portal/[marca]/envios/actions";

/** "Recebi": a própria creator confirma a entrega (D-SHIPSTATUS). */
export function ReceivedButton({ marca, shipmentId }: { marca: string; shipmentId: string }) {
  const [state, action, pending] = useActionState(confirmReceivedAction, undefined);
  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="marca" value={marca} />
      <input type="hidden" name="shipmentId" value={shipmentId} />
      <button disabled={pending} className="rounded-full bg-brand px-5 py-2 text-sm font-semibold text-white shadow-sm disabled:opacity-60">
        {pending ? "Confirmando…" : "Recebi"}
      </button>
      {state?.error && <span role="alert" className="text-xs text-red-700 dark:text-red-400">{state.error}</span>}
    </form>
  );
}
