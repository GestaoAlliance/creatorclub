"use client";

import { useActionState } from "react";
import { Msg } from "@/components/ui/msg";
import { ui } from "@/components/ui/styles";
import { publishTermsAction } from "./actions";

/** Publicar versão nova do termo: cada publicação pede novo aceite de todas as creators (D-TERMS). */
export function PublishTermsForm({ brandId, title, body }: { brandId: string; title: string; body: string }) {
  const [state, action, pending] = useActionState(publishTermsAction, undefined);
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm("Publicar esta versão? Todas as creators vão precisar aceitar de novo para usar o portal.")) e.preventDefault();
      }}
      className="flex flex-col gap-3"
    >
      <input type="hidden" name="brandId" value={brandId} />
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
