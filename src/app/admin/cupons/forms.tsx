"use client";

import { Check } from "lucide-react";
import { useActionState, useState } from "react";
import { classifyAction, confirmBothAction, confirmOwnerAction, confirmRateAction } from "./actions";

import { Msg } from "@/components/ui/msg";
import { Picker } from "@/components/ui/picker";
import { ui } from "@/components/ui/styles";

const btn = ui.ghostSm;
const field = ui.inputSm;

export function ClassifyForm({ couponId, kind, only }: { couponId: string; kind: string | null; only?: "PROMO" }) {
  const [state, action, pending] = useActionState(classifyAction, undefined);
  return (
    <form action={action} className="flex flex-wrap items-center gap-1.5">
      <input type="hidden" name="couponId" value={couponId} />
      {!only && <button name="kind" value="CREATOR" className={kind === "CREATOR" ? ui.btnSm : btn} disabled={pending}>CREATOR</button>}
      <button name="kind" value="PROMO" className={kind === "PROMO" ? ui.btnSm : btn} disabled={pending}>PROMO</button>
      <Msg state={state} />
    </form>
  );
}

export function OwnerForm(props: {
  couponId: string;
  currentCreatorId: string | null;
  needsSince: boolean;
  creators: { id: string; name: string; status: string; detail: string }[];
}) {
  const [state, action, pending] = useActionState(confirmOwnerAction, undefined);
  return (
    <form action={action} className="flex flex-wrap items-center gap-1.5">
      <input type="hidden" name="couponId" value={props.couponId} />
      <Picker
        small
        name="creatorId"
        required
        defaultValue={props.currentCreatorId}
        placeholder="Escolher a dona…"
        options={props.creators.map((c) => ({ id: c.id, name: c.name, detail: c.detail, tag: c.status !== "ACTIVE" ? "inativa" : null }))}
      />
      {props.needsSince && <input type="date" name="since" className={field} required title="Dona desde" />}
      <button className={ui.btnSm} disabled={pending}>Confirmar dona</button>
      <Msg state={state} />
    </form>
  );
}

export function RateForm({ policyId, rateBps }: { policyId: string; rateBps: number }) {
  const [state, action, pending] = useActionState(confirmRateAction, undefined);
  const pct = (rateBps / 100).toString().replace(".", ",");
  return (
    <form action={action} className="flex flex-wrap items-center gap-1.5">
      <input type="hidden" name="policyId" value={policyId} />
      <input name="rate" defaultValue={pct} className={`${field} w-16`} inputMode="decimal" aria-label="Comissão (%)" />%
      <button className={ui.btnSm} disabled={pending}>Confirmar comissão</button>
      <Msg state={state} />
    </form>
  );
}

/**
 * D-COUPONBOARD: dona e comissão num passo. Com sugestão, um clique ("É da Victoria"); "Outra creator" abre a escolha.
 * Sem dona ainda, pede "desde quando" (já vem o dia do primeiro uso do cupom).
 */
export function OwnerQuick(props: {
  couponId: string;
  suggestion: { creatorId: string; name: string } | null;
  current: { creatorId: string; name: string } | null;
  needsSince: boolean;
  since: string | null;
  ratePct: string | null;
  rateLocked: boolean;
  creators: { id: string; name: string; status: string; detail: string }[];
}) {
  const [state, action, pending] = useActionState(confirmBothAction, undefined);
  const [other, setOther] = useState(!props.suggestion && !props.current);
  const pick = props.current ?? props.suggestion;
  const extra = (
    <>
      {props.needsSince && <label className="flex items-center gap-1 text-xs text-stone-500">desde <input type="date" name="since" defaultValue={props.since ?? ""} className={`${field} w-36`} required /></label>}
      {!props.rateLocked && <label className="flex items-center gap-1 text-xs text-stone-500">comissão <input name="rate" defaultValue={props.ratePct ?? ""} className={`${field} w-14`} inputMode="decimal" aria-label="Comissão (%)" />%</label>}
    </>
  );
  if (state?.ok) return <Msg state={state} />;
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="couponId" value={props.couponId} />
      {!other && pick ? (
        <>
          <input type="hidden" name="creatorId" value={pick.creatorId} />
          <div className="flex flex-wrap items-center gap-2">{extra}</div>
          <div className="flex flex-wrap items-center gap-2">
            <button className={ui.btnSm} disabled={pending}>
              <Check className="size-3.5" /> {props.current ? `Confirmar ${props.current.name.split(" ")[0]}` : `É da ${pick.name.split(" ")[0]}`}
            </button>
            <button type="button" onClick={() => setOther(true)} className="text-xs text-stone-500 hover:underline">outra creator</button>
          </div>
          {!props.current && props.suggestion && <span className="text-[11px] text-stone-500">Sugestão pelo código: {props.suggestion.name}</span>}
        </>
      ) : (
        <>
          <Picker small name="creatorId" required defaultValue={props.current?.creatorId ?? null} placeholder="Escolher a dona…" options={props.creators.map((c) => ({ id: c.id, name: c.name, detail: c.detail, tag: c.status !== "ACTIVE" ? "inativa" : null }))} />
          <div className="flex flex-wrap items-center gap-2">
            {extra}
            <button className={ui.btnSm} disabled={pending}>Confirmar</button>
          </div>
        </>
      )}
      <Msg state={state?.error ? state : undefined} />
    </form>
  );
}
