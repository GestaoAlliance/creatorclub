"use client";

import { Pencil } from "lucide-react";
import { useActionState, useState } from "react";
import { Msg } from "@/components/ui/msg";
import { ui } from "@/components/ui/styles";
import { createLinkAction, setPhoneAction } from "./actions";

export function CreateLinkForm({ brandId, userId, suggestion, phone }: { brandId: string; userId: string; suggestion: string; phone: string | null }) {
  const [state, action, pending] = useActionState(createLinkAction, undefined);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="brandId" value={brandId} />
      <input type="hidden" name="userId" value={userId} />
      <input name="code" defaultValue={suggestion} aria-label="Código do hunter" className={`${ui.inputSm} w-36 font-mono`} required />
      <input name="phone" defaultValue={phone ?? ""} inputMode="tel" autoComplete="off" placeholder="Telefone com DDD" aria-label="Telefone do hunter" className={`${ui.inputSm} w-44`} />
      <button className={ui.btnSm} disabled={pending}>Criar link</button>
      <Msg state={state} />
    </form>
  );
}

/** Telefone do hunter (pedido da Ana): aparece na tela Hunters, com atalho para o WhatsApp. */
export function PhoneForm({ brandId, userId, phone }: { brandId: string; userId: string; phone: string | null }) {
  const [state, action, pending] = useActionState(setPhoneAction, undefined);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="brandId" value={brandId} />
      <input type="hidden" name="userId" value={userId} />
      <input name="phone" defaultValue={phone ?? ""} inputMode="tel" autoComplete="off" placeholder="Telefone com DDD" aria-label="Telefone do hunter" className={`${ui.inputSm} w-44`} />
      <button className={ui.ghostSm} disabled={pending}>{phone ? "Salvar telefone" : "Adicionar telefone"}</button>
      <Msg state={state} />
    </form>
  );
}

/** D-HUNTERBOARD: telefone em edição rápida (lápis), sem o campo sempre aberto. */
export function PhoneEdit({ brandId, userId, phone }: { brandId: string; userId: string; phone: string | null }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(setPhoneAction, undefined);
  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1 text-xs text-stone-500 hover:text-stone-800 dark:hover:text-stone-200">
        <Pencil className="size-3" /> {phone ? "editar telefone" : "adicionar telefone"}
      </button>
    );
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="brandId" value={brandId} />
      <input type="hidden" name="userId" value={userId} />
      <input name="phone" defaultValue={phone ?? ""} inputMode="tel" autoComplete="off" autoFocus placeholder="Telefone com DDD" aria-label="Telefone do hunter" className={`${ui.inputSm} w-40`} />
      <button className={ui.btnSm} disabled={pending}>Salvar</button>
      <button type="button" onClick={() => setOpen(false)} className={ui.ghostSm}>Cancelar</button>
      <Msg state={state} />
    </form>
  );
}
