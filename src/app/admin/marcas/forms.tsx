"use client";

import { useActionState, useState } from "react";
import { Msg } from "@/components/ui/msg";
import { ui } from "@/components/ui/styles";
import { createBrandAction, updateBrandAction } from "./actions";

type Values = { brandId?: string; name: string; slug?: string; primaryColor: string; legalName: string; cnpj: string };

/** Cadastrar marca nova ou editar uma existente (A1b). O endereço (slug) só se escolhe ao criar. */
export function BrandForm({ initial, create = false }: { initial: Values; create?: boolean }) {
  const [state, action, pending] = useActionState(create ? createBrandAction : updateBrandAction, undefined);
  const [color, setColor] = useState(initial.primaryColor);
  return (
    <form action={action} className="flex flex-col gap-3">
      {initial.brandId && <input type="hidden" name="brandId" value={initial.brandId} />}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={ui.label}>
          Nome
          <input name="name" defaultValue={initial.name} required className={ui.input} />
        </label>
        {create ? (
          <label className={ui.label}>
            Endereço (opcional)
            <input name="slug" defaultValue={initial.slug} placeholder="ex.: vermefree" className={`${ui.input} font-mono`} />
          </label>
        ) : (
          <p className={`${ui.label} justify-end`}>
            <span className="text-xs text-stone-500">Endereço</span>
            <span className="font-mono text-sm">{initial.slug}</span>
          </p>
        )}
        <label className={ui.label}>
          Razão social
          <input name="legalName" defaultValue={initial.legalName} className={ui.input} />
        </label>
        <label className={ui.label}>
          CNPJ (tomador da nota fiscal)
          <input name="cnpj" defaultValue={initial.cnpj} inputMode="numeric" placeholder="00.000.000/0000-00" className={ui.input} />
        </label>
        <label className={ui.label}>
          Cor da marca
          <span className="flex items-center gap-2">
            <input type="color" value={color} onChange={(e) => setColor(e.target.value.toUpperCase())} aria-label="Escolher a cor" className="h-10 w-12 cursor-pointer rounded-xl" />
            <input name="primaryColor" value={color} onChange={(e) => setColor(e.target.value)} className={`${ui.input} font-mono`} />
          </span>
        </label>
      </div>
      <Msg state={state} />
      <button className={`${ui.btn} self-start`} disabled={pending}>{create ? "Criar marca" : "Salvar"}</button>
    </form>
  );
}
