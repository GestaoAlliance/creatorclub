"use client";

import { useActionState } from "react";
import { Msg } from "@/components/ui/msg";
import { ui } from "@/components/ui/styles";
import { payAction, rejectAction } from "./actions";

export function PayForm({ withdrawalId, label }: { withdrawalId: string; label: string }) {
  const [state, action, pending] = useActionState(payAction, undefined);
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm(`Confirmar que o Pix de ${label} foi feito?`)) e.preventDefault();
      }}
      className="flex flex-col gap-1.5"
    >
      <input type="hidden" name="withdrawalId" value={withdrawalId} />
      <button className={`${ui.btn} w-full`} disabled={pending}>{pending ? "Salvando…" : "Pix feito: marcar como pago"}</button>
      <Msg state={state} />
    </form>
  );
}

export function RejectForm({ withdrawalId }: { withdrawalId: string }) {
  const [state, action, pending] = useActionState(rejectAction, undefined);
  return (
    <form action={action} className="flex flex-col gap-1.5">
      <input type="hidden" name="withdrawalId" value={withdrawalId} />
      <div className="flex gap-2">
        <input name="reason" required maxLength={300} placeholder="Motivo da recusa (a creator vê)" className={`${ui.inputSm} min-w-0 flex-1`} />
        <button className={ui.dangerSm} disabled={pending}>Recusar</button>
      </div>
      <Msg state={state} />
    </form>
  );
}
