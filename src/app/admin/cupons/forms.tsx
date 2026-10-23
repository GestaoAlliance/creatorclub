"use client";

import { useActionState } from "react";
import { classifyAction, confirmOwnerAction, confirmRateAction } from "./actions";

import { Msg } from "@/components/ui/msg";
import { Picker } from "@/components/ui/picker";
import { ui } from "@/components/ui/styles";

const btn = ui.ghostSm;
const field = ui.inputSm;

export function ClassifyForm({ couponId, kind }: { couponId: string; kind: string | null }) {
  const [state, action, pending] = useActionState(classifyAction, undefined);
  return (
    <form action={action} className="flex flex-wrap items-center gap-1.5">
      <input type="hidden" name="couponId" value={couponId} />
      <button name="kind" value="CREATOR" className={kind === "CREATOR" ? ui.btnSm : btn} disabled={pending}>CREATOR</button>
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
