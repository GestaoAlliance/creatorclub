"use client";

import { RefreshCw } from "lucide-react";
import { useActionState } from "react";
import { Msg } from "@/components/ui/msg";
import { ui } from "@/components/ui/styles";
import { approveAction, payAction, recheckAction, rejectAction } from "./actions";

export function ApproveForm({ withdrawalId, label }: { withdrawalId: string; label: string }) {
  const [state, action, pending] = useActionState(approveAction, undefined);
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm(`Aprovar o saque de ${label}? Ele vai para o Pagamento fazer o Pix.`)) e.preventDefault();
      }}
      className="flex flex-col gap-1.5"
    >
      <input type="hidden" name="withdrawalId" value={withdrawalId} />
      <button className={`${ui.btn} w-full`} disabled={pending}>{pending ? "Salvando…" : "Aprovar para pagamento"}</button>
      <Msg state={state} />
    </form>
  );
}

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

/** "Conferir de novo": lê a nota outra vez e atualiza o selo. */
export function RecheckForm({ withdrawalId }: { withdrawalId: string }) {
  const [state, action, pending] = useActionState(recheckAction, undefined);
  return (
    <form action={action} className="flex flex-col gap-1.5">
      <input type="hidden" name="withdrawalId" value={withdrawalId} />
      <button className={ui.ghostSm} disabled={pending}>
        <RefreshCw className={`size-3.5 ${pending ? "animate-spin" : ""}`} /> {pending ? "Conferindo…" : "Conferir de novo"}
      </button>
      <Msg state={state} />
    </form>
  );
}
