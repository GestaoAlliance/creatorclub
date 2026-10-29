"use client";

import { CARRIERS } from "@/domain";
import { useActionState, useState } from "react";
import { approveAction, cancelAction, createShipmentAction, firstKitNoticeAction, deliveredAction, rejectAction, shippedAction } from "./actions";

import { AddressFields } from "@/components/ui/address-fields";
import { Msg } from "@/components/ui/msg";
import { Picker } from "@/components/ui/picker";
import { ui } from "@/components/ui/styles";

const field = ui.inputSm;

export function NewShipmentForm(props: {
  creators: { id: string; name: string; detail: string; hasAddress: boolean }[];
  products: { id: string; title: string }[];
}) {
  const [state, action, pending] = useActionState(createShipmentAction, undefined);
  const [creatorId, setCreatorId] = useState("");
  const noAddress = props.creators.find((c) => c.id === creatorId)?.hasAddress === false;
  return (
    <form action={action} className={ui.card}>
      <h2 className={ui.h2}>Novo envio</h2>
      <div className={ui.label}>
        Creator
        <Picker
          name="creatorId"
          required
          placeholder="Escolher a creator…"
          onChange={setCreatorId}
          options={props.creators.map((c) => ({ id: c.id, name: c.name, detail: c.detail, tag: c.hasAddress ? null : "sem endereço" }))}
        />
      </div>
      {noAddress && (
        <fieldset className={`${ui.inset} flex flex-col gap-2`}>
          <legend className="text-xs font-medium text-stone-500">Endereço de entrega</legend>
          <p className={ui.hint}>Ela ainda não tem endereço no portal. O endereço digitado vai neste envio e fica salvo na conta dela.</p>
          <AddressFields key={creatorId} inputClass={ui.input} />
        </fieldset>
      )}
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
      {/* D-TRACKING: lista, para o link do rastreio sempre funcionar. */}
      <select name="carrier" defaultValue="Correios" className={`${field} w-32`} aria-label="Transportadora">
        {CARRIERS.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>
      <input name="trackingCode" required placeholder="código de rastreio" className={`${field} w-40 font-mono`} />
      <input name="freight" inputMode="decimal" placeholder="frete R$ (opcional)" className={`${field} w-36`} aria-label="Frete pago (R$)" />
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

/** D-FIRSTKITNOTICE (só super admin): mostra quantas e o texto; dispara só no clique, espaçado no WhatsApp. */
export function FirstKitNotice(p: { count: number; names: string[]; text: string; hasWhatsApp: boolean }) {
  const [state, action, pending] = useActionState(firstKitNoticeAction, undefined);
  return (
    <details className={ui.card}>
      <summary className="cursor-pointer text-sm font-medium">Avisar creators com 1º pedido liberado ({p.count})</summary>
      <div className="mt-3 flex flex-col gap-3 text-sm">
        <p className={ui.hint}>Vai pelo WhatsApp da marca, uma mensagem a cada 45 segundos (das 9h às 20h), só para quem ainda não pediu o produto.</p>
        <pre className={`${ui.inset} whitespace-pre-wrap font-sans text-sm`}>{p.text}</pre>
        <p className={ui.hint}>Para: {p.names.join(", ")}</p>
        {!p.hasWhatsApp && <p className="text-amber-800 dark:text-amber-300">Esta marca ainda não tem WhatsApp ligado.</p>}
        <form action={action} onSubmit={(e) => { if (!confirm(`Mandar o aviso para ${p.count} creators?`)) e.preventDefault(); }} className="flex items-center gap-3">
          <button className={ui.btnSm} disabled={pending || !p.hasWhatsApp}>{pending ? "Colocando na fila…" : `Mandar para ${p.count}`}</button>
          <Msg state={state} />
        </form>
      </div>
    </details>
  );
}
