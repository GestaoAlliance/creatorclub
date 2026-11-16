"use client";

import { useActionState, useEffect, useState } from "react";
import { AddressFields } from "@/components/ui/address-fields";
import { Msg } from "@/components/ui/msg";
import { ui } from "@/components/ui/styles";
import { addressAction, pixAction } from "./actions";

/** D-PIXCHANGE: trocar a chave Pix na ficha, com o motivo (a creator recebe um aviso). */
export function PixForm({ creatorId, current }: { creatorId: string; current: string | null }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(pixAction, undefined);
  useEffect(() => {
    if (state?.ok) setOpen(false);
  }, [state]);
  if (!open) {
    return (
      <span className="flex flex-wrap items-center gap-2">
        {state?.ok && <span role="status" className="text-xs text-emerald-700 dark:text-emerald-300">{state.ok}</span>}
        <button type="button" onClick={() => setOpen(true)} className={`${ui.link} text-xs`}>{current ? "Trocar chave" : "Cadastrar chave"}</button>
      </span>
    );
  }
  return (
    <form action={action} className="mt-1 grid gap-2 sm:grid-cols-2">
      <input type="hidden" name="creatorId" value={creatorId} />
      <label className={ui.label}>Nova chave Pix<input name="pixKey" required className={ui.input} /></label>
      <label className={ui.label}>Motivo<input name="reason" required placeholder="ex.: a creator pediu pelo WhatsApp" className={ui.input} /></label>
      <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
        <button disabled={pending} className={ui.btn}>Salvar chave</button>
        <button type="button" onClick={() => setOpen(false)} className={ui.ghostSm}>Cancelar</button>
        <span className="text-[11px] text-stone-500">A creator recebe um aviso da troca.</span>
      </div>
      {state?.error && <div className="sm:col-span-2"><Msg state={state} /></div>}
    </form>
  );
}

type Addr = { zip: string; street: string; number: string; complement: string | null; district: string; city: string; state: string };

/** D-ADDRSTAFF: corrigir o endereço na ficha; opção de trocar também nos envios ainda não enviados. */
export function AddressForm({ creatorId, address }: { creatorId: string; address: Addr }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(addressAction, undefined);
  useEffect(() => {
    if (state?.ok) setOpen(false);
  }, [state]);
  if (!open) {
    return (
      <span className="flex flex-wrap items-center gap-2">
        {state?.ok && <span role="status" className="text-xs text-emerald-700 dark:text-emerald-300">{state.ok}</span>}
        <button type="button" onClick={() => setOpen(true)} className={`${ui.link} text-xs`}>{address.zip ? "Corrigir endereço" : "Cadastrar endereço"}</button>
      </span>
    );
  }
  return (
    <form action={action} className="mt-1 flex flex-col gap-3">
      <input type="hidden" name="creatorId" value={creatorId} />
      <AddressFields initial={address} inputClass={ui.input} />
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="alsoPending" defaultChecked className="size-4 accent-[var(--brand)]" />Trocar também nos envios que ainda não saíram</label>
      <div className="flex flex-wrap items-center gap-2">
        <button disabled={pending} className={ui.btn}>Salvar endereço</button>
        <button type="button" onClick={() => setOpen(false)} className={ui.ghostSm}>Cancelar</button>
      </div>
      {state?.error && <Msg state={state} />}
    </form>
  );
}
