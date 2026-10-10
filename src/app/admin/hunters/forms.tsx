"use client";

import { useActionState } from "react";
import { Msg } from "@/components/ui/msg";
import { ui } from "@/components/ui/styles";
import { createLinkAction } from "./actions";

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
