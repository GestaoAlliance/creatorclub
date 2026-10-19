"use client";

import { useActionState } from "react";
import { approveAction, cancelAction, createShipmentAction, deliveredAction, rejectAction, shippedAction } from "./actions";

import { Msg } from "@/components/ui/msg";
import { Picker } from "@/components/ui/picker";
import { ui } from "@/components/ui/styles";

const field = ui.inputSm;

export function NewShipmentForm(props: {
  creators: { id: string; name: string; detail: string; hasAddress: boolean }[];
  products: { id: string; title: string }[];
}) {
  const [state, action, pending] = useActionState(createShipmentAction, undefined);
  return (
    <form action={action} className={ui.card}>
      <h2 className={ui.h2}>Novo envio</h2>
      <div className={ui.label}>
        Creator
        <Picker
          name="creatorId"
          required
          placeholder="Escolher a creator…"
          options={props.creators.map((c) => ({ id: c.id, name: c.name, detail: c.detail, tag: c.hasAddress ? null : "sem endereço", disabled: !c.hasAddress }))}
        />
      </div>
      <fieldset className="flex flex-col gap-1">
        <legend className="mb-2 text-xs font-medium text-stone-500">Produtos (quantidade)</legend>
        {props.products.length === 0 && <p className={ui.hint}>Nenhum produto carregado da loja ainda.</p>}
        <div className="grid gap-2 md:grid-cols-2">
          {props.products.map((p) => (
            <label key={p.id} className={`${ui.inset} flex items-center gap-3 py-2`}>
              <input name={`qty:${p.id}`} type="number" min={0} max={99} defaultValue={0} className={`${field} w-16 text-center`} />
              <span className="text-sm">{p.title}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <label className={ui.label}>
        Observação (a creator vê)
        <input name="note" maxLength={500} className={ui.input} />
      </label>
      <div className="flex items-center gap-3">
        <button className={ui.btn} disabled={pending}>Registrar envio</button>
        <Msg state={state} />
      </div>
    </form>
  );
}

export function ShippedForm({ shipmentId }: { shipmentId: string }) {
  const [state, action, pending] = useActionState(shippedAction, undefined);
  return (
    <form action={action} className="flex flex-wrap items-center gap-1.5">
      <input type="hidden" name="shipmentId" value={shipmentId} />
      <input name="carrier" defaultValue="Correios" className={`${field} w-28`} aria-label="Transportadora" />
      <input name="trackingCode" required placeholder="código de rastreio" className={`${field} w-40 font-mono`} />
      <button className={ui.btnSm} disabled={pending}>Marcar enviado</button>
      <Msg state={state} />
    </form>
  );
}

export function DeliveredForm({ shipmentId }: { shipmentId: string }) {
  const [state, action, pending] = useActionState(deliveredAction, undefined);
  return (
    <form action={action} className="inline-flex flex-wrap items-center gap-1.5">
      <input type="hidden" name="shipmentId" value={shipmentId} />
      <button className={ui.btnSm} disabled={pending}>Marcar entregue</button>
      <Msg state={state} />
    </form>
  );
}

export function CancelForm({ shipmentId }: { shipmentId: string }) {
  const [state, action, pending] = useActionState(cancelAction, undefined);
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm("Cancelar este envio?")) e.preventDefault();
      }}
      className="inline-flex flex-wrap items-center gap-1.5"
    >
      <input type="hidden" name="shipmentId" value={shipmentId} />
      <button className={ui.dangerSm} disabled={pending}>Cancelar envio</button>
      <Msg state={state} />
    </form>
  );
}

/** D-KITAPPROVAL: aprovar o pedido da creator ou recusar com motivo (ela vê o motivo e escolhe de novo). */
export function ApprovalForms({ shipmentId }: { shipmentId: string }) {
  const [okState, approve, approving] = useActionState(approveAction, undefined);
  const [noState, reject, rejecting] = useActionState(rejectAction, undefined);
  return (
    <div className="flex flex-col gap-2">
      <form action={approve}>
        <input type="hidden" name="shipmentId" value={shipmentId} />
        <button className={`${ui.btnSm} self-start`} disabled={approving}>Aprovar pedido</button>
      </form>
      <Msg state={okState} />
      <form action={reject} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="shipmentId" value={shipmentId} />
        <input name="reason" placeholder="Motivo para recusar (ela vê no portal)" className={`${ui.inputSm} min-w-0 flex-1`} />
        <button className={ui.dangerSm} disabled={rejecting}>Recusar</button>
      </form>
      <Msg state={noState} />
    </div>
  );
}
