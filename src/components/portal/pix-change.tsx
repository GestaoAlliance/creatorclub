"use client";

import { useActionState, useEffect, useState } from "react";
import { changeMyPixAction } from "@/app/portal/[marca]/saque/pix-actions";
import { Msg } from "@/components/ui/msg";
import { ui } from "@/components/ui/styles";

/** D-PIXCHANGE: trocar a chave Pix no portal (com confirmação digitando de novo). */
export function PixChange({ marca }: { marca: string }) {
  const [open, setOpen] = useState(false);
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [state, action, pending] = useActionState(changeMyPixAction, undefined);
  useEffect(() => {
    if (state?.ok) setOpen(false);
  }, [state]);
  if (!open) {
    return (
      <div className="flex flex-col gap-1">
        {state?.ok && <p role="status" className="text-xs text-emerald-700 dark:text-emerald-300">{state.ok}</p>}
        <button type="button" onClick={() => setOpen(true)} className={`${ui.link} self-start text-xs`}>Trocar a chave Pix</button>
      </div>
    );
  }
  const mismatch = a.trim() !== "" && b.trim() !== "" && a.trim() !== b.trim();
  return (
    <form action={action} className="mt-1 flex flex-col gap-2">
      <input type="hidden" name="marca" value={marca} />
      <label className={ui.label}>Nova chave Pix<input name="pixKey" value={a} onChange={(e) => setA(e.target.value)} required placeholder="CPF, CNPJ, e-mail, celular ou aleatória" className={ui.input} /></label>
      <label className={ui.label}>Repita a nova chave<input value={b} onChange={(e) => setB(e.target.value)} required autoComplete="off" className={ui.input} /></label>
      {mismatch && <p className="text-xs text-red-700 dark:text-red-400">As duas chaves não são iguais.</p>}
      {state?.error && <Msg state={state} />}
      <p className="text-[11px] text-stone-500">A chave precisa ser sua (do seu CPF ou do CNPJ do cadastro). Você recebe um aviso de confirmação.</p>
      <div className="flex gap-2">
        <button disabled={pending || mismatch || !a.trim() || a.trim() !== b.trim()} className={ui.btn}>Salvar nova chave</button>
        <button type="button" onClick={() => setOpen(false)} className={ui.ghostSm}>Cancelar</button>
      </div>
    </form>
  );
}
