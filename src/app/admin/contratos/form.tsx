"use client";

import { useActionState } from "react";
import { Msg } from "@/components/ui/msg";
import { ui } from "@/components/ui/styles";
import { publishContractAction } from "./actions";

/** Publicar versão nova do texto de um tipo de contrato (D-SIGNCONTRACT). Quem já assinou não assina de novo. */
export function PublishContractForm({ brandId, kind, title, body }: { brandId: string; kind: string; title: string; body: string }) {
  const [state, action, pending] = useActionState(publishContractAction, undefined);
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm("Publicar esta versão? Ela vale para quem ainda vai assinar.")) e.preventDefault();
      }}
      className="flex flex-col gap-3"
    >
      <input type="hidden" name="brandId" value={brandId} />
      <input type="hidden" name="kind" value={kind} />
      <label className={ui.label}>
        Título
        <input name="title" defaultValue={title} required maxLength={200} className={ui.input} />
      </label>
      <label className={ui.label}>
        Texto
        <textarea name="body" defaultValue={body} required rows={18} className={`${ui.input} font-mono text-xs leading-relaxed`} />
      </label>
      <Msg state={state} />
      <button className={`${ui.btn} self-start`} disabled={pending}>Publicar nova versão</button>
    </form>
  );
}
