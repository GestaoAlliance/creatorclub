"use client";

import { RefreshCw } from "lucide-react";
import { useActionState, useEffect, useState } from "react";
import { Msg } from "@/components/ui/msg";
import { ui } from "@/components/ui/styles";
import { approveAction, payAction, payBatchAction, recheckAction, rejectAction } from "./actions";

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

export const BATCH_FORM = "lote-pagar";
const brl = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const boxes = () => [...document.querySelectorAll<HTMLInputElement>(`input[name=ids][form=${BATCH_FORM}]`)];

/** Caixa de cada aprovado para o pagamento em lote (fica no cartão, liga no formulário do lote pelo `form`). */
export function BatchCheck({ withdrawalId, cents, name }: { withdrawalId: string; cents: number; name: string }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" name="ids" value={withdrawalId} form={BATCH_FORM} data-cents={cents} className="size-4 accent-[var(--brand)]" onChange={() => window.dispatchEvent(new Event("lote"))} />
      Incluir no lote <span className="sr-only">{name}</span>
    </label>
  );
}

/** M1.5 (D-WDBATCH): baixar a planilha dos aprovados e, depois do Pix em lote, marcar os escolhidos como pagos. */
export function BatchBar({ count }: { count: number }) {
  const [state, action, pending] = useActionState(payBatchAction, undefined);
  const [sel, setSel] = useState({ n: 0, cents: 0 });
  const recount = () => {
    const on = boxes().filter((b) => b.checked);
    setSel({ n: on.length, cents: on.reduce((s, b) => s + Number(b.dataset.cents), 0) });
  };
  useEffect(() => {
    window.addEventListener("lote", recount);
    recount();
    return () => window.removeEventListener("lote", recount);
  }, [state]);
  return (
    <form
      id={BATCH_FORM}
      action={action}
      onSubmit={(e) => {
        if (!sel.n || !confirm(`Confirmar que os ${sel.n} Pix (total ${brl(sel.cents)}) foram feitos?`)) e.preventDefault();
      }}
      className={`${ui.card} flex flex-col gap-3`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <p className="mr-auto text-sm">
          <strong>Pagamento em lote</strong> · {count} {count === 1 ? "aprovado" : "aprovados"} · selecionados: <strong>{sel.n}</strong> ({brl(sel.cents)})
        </p>
        <a href="/admin/saques/lote" className={ui.ghostSm}>Baixar planilha dos aprovados</a>
        <button type="button" className={ui.ghostSm} onClick={() => { const all = boxes(); const on = all.some((b) => !b.checked); all.forEach((b) => (b.checked = on)); recount(); }}>
          Selecionar todos
        </button>
        <button className={ui.btnSm} disabled={pending || sel.n === 0}>{pending ? "Salvando…" : "Pix feitos: marcar selecionados como pagos"}</button>
      </div>
      <Msg state={state} />
    </form>
  );
}
