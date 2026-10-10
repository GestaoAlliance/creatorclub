"use client";

import { useActionState } from "react";
import { Msg } from "@/components/ui/msg";
import { ui } from "@/components/ui/styles";
import { createLinkAction, formLinkAction } from "./actions";

export function CreateLinkForm({ brandId, userId, suggestion }: { brandId: string; userId: string; suggestion: string }) {
  const [state, action, pending] = useActionState(createLinkAction, undefined);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="brandId" value={brandId} />
      <input type="hidden" name="userId" value={userId} />
      <input name="code" defaultValue={suggestion} aria-label="Código do hunter" className={`${ui.inputSm} w-36 font-mono`} required />
      <button className={ui.btnSm} disabled={pending}>Criar link</button>
      <Msg state={state} />
    </form>
  );
}

export function FormLinkForm({ brandId, form, current, label }: { brandId: string; form: string; current: string | null; label: string }) {
  const [state, action, pending] = useActionState(formLinkAction, undefined);
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="brandId" value={brandId} />
      <input type="hidden" name="form" value={form} />
      <label className={ui.label}>
        {label}
        <input name="url" defaultValue={current ?? ""} placeholder="https://docs.google.com/forms/d/e/…/viewform?usp=pp_url&entry.123=CODIGO" className={ui.input} required />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button className={ui.btnSm} disabled={pending}>Salvar</button>
        <Msg state={state} />
      </div>
    </form>
  );
}
