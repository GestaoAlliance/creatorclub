"use client";

import { useActionState } from "react";
import { cancelAction, createShipmentAction, deliveredAction, shippedAction } from "./actions";

import { Msg } from "@/components/ui/msg";
import { ui } from "@/components/ui/styles";

const field = ui.inputSm;

export function NewShipmentForm(props: {
  creators: { id: string; name: string; hasAddress: boolean }[];
  products: { id: string; title: string }[];
}) {
  const [state, action, pending] = useActionState(createShipmentAction, undefined);
  return (
    <form action={action} className={ui.card}>
      <h2 className={ui.h2}>Novo envio</h2>
      <label className={ui.label}>
        Creator
        <select name="creatorId" required defaultValue="" className={ui.input}>
          <option value="" disabled>escolher…</option>
          {props.creators.map((c) => (
            <option key={c.id} value={c.id} disabled={!c.hasAddress}>{c.name}{c.hasAddress ? "" : " (sem endereço)"}</option>
          ))}
        </select>
      </label>
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
