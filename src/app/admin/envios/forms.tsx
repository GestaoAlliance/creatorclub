"use client";

import { useActionState } from "react";
import { cancelAction, createShipmentAction, deliveredAction, shippedAction, type ActionState } from "./actions";

const btn = "rounded border border-stone-300 px-2 py-1 text-xs font-semibold disabled:opacity-50";
const field = "rounded border border-stone-300 px-2 py-1 text-xs";

function Msg({ state }: { state: ActionState }) {
  if (state?.error) return <span role="alert" className="text-xs text-red-700">{state.error}</span>;
  if (state?.ok) return <span className="text-xs text-green-800">{state.ok}</span>;
  return null;
}

export function NewShipmentForm(props: {
  creators: { id: string; name: string; hasAddress: boolean }[];
  products: { id: string; title: string }[];
}) {
  const [state, action, pending] = useActionState(createShipmentAction, undefined);
  return (
    <form action={action} className="flex flex-col gap-3 rounded border border-stone-300 p-4 text-sm">
      <h2 className="font-semibold">Novo envio</h2>
      <label className="flex flex-col gap-1">
        Creator
        <select name="creatorId" required defaultValue="" className="rounded border border-stone-300 px-2 py-1.5">
          <option value="" disabled>escolher…</option>
          {props.creators.map((c) => (
            <option key={c.id} value={c.id} disabled={!c.hasAddress}>{c.name}{c.hasAddress ? "" : " (sem endereço)"}</option>
          ))}
        </select>
      </label>
      <fieldset className="flex flex-col gap-1">
        <legend className="mb-1">Produtos (quantidade)</legend>
        {props.products.length === 0 && <p className="text-xs text-stone-500">Nenhum produto carregado da loja ainda.</p>}
        <div className="grid gap-1 md:grid-cols-2">
          {props.products.map((p) => (
            <label key={p.id} className="flex items-center gap-2">
              <input name={`qty:${p.id}`} type="number" min={0} max={99} defaultValue={0} className={`${field} w-14`} />
              <span className="text-xs">{p.title}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <label className="flex flex-col gap-1">
        Observação (a creator vê)
        <input name="note" maxLength={500} className="rounded border border-stone-300 px-2 py-1.5" />
      </label>
      <div className="flex items-center gap-3">
        <button className="rounded bg-stone-800 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50" disabled={pending}>Registrar envio</button>
        <Msg state={state} />
      </div>
    </form>
  );
}

export function ShippedForm({ shipmentId }: { shipmentId: string }) {
  const [state, action, pending] = useActionState(shippedAction, undefined);
  return (
    <form action={action} className="flex flex-wrap items-center gap-1">
      <input type="hidden" name="shipmentId" value={shipmentId} />
      <input name="carrier" defaultValue="Correios" className={`${field} w-24`} aria-label="Transportadora" />
      <input name="trackingCode" required placeholder="código de rastreio" className={`${field} w-36 font-mono`} />
      <button className={btn} disabled={pending}>Marcar enviado</button>
      <Msg state={state} />
    </form>
  );
}

export function DeliveredForm({ shipmentId }: { shipmentId: string }) {
  const [state, action, pending] = useActionState(deliveredAction, undefined);
  return (
    <form action={action} className="inline-flex items-center gap-1">
      <input type="hidden" name="shipmentId" value={shipmentId} />
      <button className={btn} disabled={pending}>Marcar entregue</button>
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
      className="inline-flex items-center gap-1"
    >
      <input type="hidden" name="shipmentId" value={shipmentId} />
      <button className={`${btn} text-red-700`} disabled={pending}>Cancelar</button>
      <Msg state={state} />
    </form>
  );
}
