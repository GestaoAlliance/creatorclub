"use client";

import { useActionState, useState } from "react";
import { Msg } from "@/components/ui/msg";
import { ui } from "@/components/ui/styles";
import { MANUAL_ORIGIN_KINDS, ORIGIN_LABEL, originText, type Origin } from "@/domain";
import { originAction } from "./actions";

/** D-ORIGIN: "Veio de" na ficha; sem inscrição, a Gestão marca a origem. */
export function OriginLine({ creatorId, origin, hunters, canEdit }: { creatorId: string; origin: Origin; hunters: { id: string; name: string }[]; canEdit: boolean }) {
  const [state, action, pending] = useActionState(originAction, undefined);
  const [editing, setEditing] = useState(false);
  const [kind, setKind] = useState<string>(origin.manual ? origin.kind : "");
  const editable = canEdit && (origin.manual || origin.kind === "UNKNOWN");
  return (
    <div className="flex flex-col gap-2 text-sm">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-stone-500">Veio de:</span>
        <span className="font-medium">{originText(origin)}</span>
        {origin.day && <span className={ui.hint}>· inscrita em {origin.day.split("-").reverse().join("/")}</span>}
        {origin.heardFrom && <span className={ui.hint}>· conheceu por: {origin.heardFrom}</span>}
        {origin.manual && <span className={ui.hint}>· marcada pela equipe{origin.note ? ` (${origin.note})` : ""}</span>}
        {editable && !editing && (
          <button type="button" onClick={() => setEditing(true)} className={ui.ghostSm}>{origin.kind === "UNKNOWN" ? "Marcar origem" : "Alterar"}</button>
        )}
      </p>
      {editable && editing && (
        <form action={action} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="creatorId" value={creatorId} />
          <select name="kind" value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Origem" className={ui.inputSm}>
            <option value="">Não informada</option>
            {MANUAL_ORIGIN_KINDS.map((k) => <option key={k} value={k}>{ORIGIN_LABEL[k]}</option>)}
          </select>
          {kind === "HUNTER" && (
            <select name="hunterId" defaultValue={origin.hunter?.id ?? ""} aria-label="Hunter" className={ui.inputSm}>
              <option value="">Hunter não sei</option>
              {hunters.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
            </select>
          )}
          {kind && <input name="note" defaultValue={origin.note ?? ""} maxLength={200} placeholder="Observação (opcional): ex. indicada pela Maria" aria-label="Observação" className={`${ui.inputSm} min-w-56 flex-1`} />}
          <button className={ui.btnSm} disabled={pending}>{pending ? "Salvando…" : "Salvar"}</button>
          <button type="button" onClick={() => setEditing(false)} className={ui.ghostSm}>Cancelar</button>
        </form>
      )}
      <Msg state={state} />
    </div>
  );
}
