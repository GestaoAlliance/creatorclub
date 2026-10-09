"use client";

import { useActionState } from "react";
import { classifyAction, confirmOwnerAction, confirmRateAction, type ActionState } from "./actions";

const btn = "rounded border border-stone-300 px-2 py-1 text-xs font-semibold disabled:opacity-50";
const field = "rounded border border-stone-300 px-2 py-1 text-xs";

function Msg({ state }: { state: ActionState }) {
  if (state?.error) return <span role="alert" className="text-xs text-red-700">{state.error}</span>;
  if (state?.ok) return <span className="text-xs text-green-800">{state.ok}</span>;
  return null;
}

export function ClassifyForm({ couponId, kind }: { couponId: string; kind: string | null }) {
  const [state, action, pending] = useActionState(classifyAction, undefined);
  return (
    <form action={action} className="flex flex-wrap items-center gap-1">
      <input type="hidden" name="couponId" value={couponId} />
      <button name="kind" value="CREATOR" className={`${btn} ${kind === "CREATOR" ? "bg-stone-800 text-white" : ""}`} disabled={pending}>CREATOR</button>
      <button name="kind" value="PROMO" className={`${btn} ${kind === "PROMO" ? "bg-stone-800 text-white" : ""}`} disabled={pending}>PROMO</button>
      <Msg state={state} />
    </form>
  );
}

export function OwnerForm(props: {
  couponId: string;
  currentCreatorId: string | null;
  needsSince: boolean;
  creators: { id: string; name: string; status: string }[];
}) {
  const [state, action, pending] = useActionState(confirmOwnerAction, undefined);
  return (
    <form action={action} className="flex flex-wrap items-center gap-1">
      <input type="hidden" name="couponId" value={props.couponId} />
      <select name="creatorId" defaultValue={props.currentCreatorId ?? ""} className={field} required>
        <option value="" disabled>escolher…</option>
        {props.creators.map((c) => (
          <option key={c.id} value={c.id}>{c.name}{c.status !== "ACTIVE" ? " (inativa)" : ""}</option>
        ))}
      </select>
      {props.needsSince && <input type="date" name="since" className={field} required title="Dona desde" />}
      <button className={btn} disabled={pending}>Confirmar dona</button>
      <Msg state={state} />
    </form>
  );
}

export function RateForm({ policyId, rateBps }: { policyId: string; rateBps: number }) {
  const [state, action, pending] = useActionState(confirmRateAction, undefined);
  const pct = (rateBps / 100).toString().replace(".", ",");
  return (
    <form action={action} className="flex flex-wrap items-center gap-1">
      <input type="hidden" name="policyId" value={policyId} />
      <input name="rate" defaultValue={pct} className={`${field} w-16`} inputMode="decimal" aria-label="Taxa (%)" />%
      <button className={btn} disabled={pending}>Confirmar taxa</button>
      <Msg state={state} />
    </form>
  );
}
