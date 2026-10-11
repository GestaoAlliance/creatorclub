"use client";

import { useActionState } from "react";
import { Msg } from "@/components/ui/msg";
import { ui } from "@/components/ui/styles";
import { grantRoleAction } from "./actions";

/** A1b (D-ALLIANCE): dar mais um papel, marca por marca, a quem já está na equipe. */
export function GrantForm({ userId, brands }: { userId: string; brands: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState(grantRoleAction, undefined);
  return (
    <details>
      <summary className="cursor-pointer text-xs text-stone-500 hover:underline">Adicionar papel em outra marca</summary>
      <form action={action} className="mt-2 flex flex-wrap items-center gap-2">
        <input type="hidden" name="userId" value={userId} />
        <select name="role" aria-label="Papel" className={ui.inputSm} defaultValue="GESTAO">
          <option value="GESTAO">Gestão</option>
          <option value="ENVIO">Envio</option>
          <option value="PAGAMENTO">Pagamento</option>
          <option value="HUNTER">Hunter</option>
        </select>
        <select name="brandId" aria-label="Marca" className={ui.inputSm}>
          {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <button className={ui.btnSm} disabled={pending}>Adicionar</button>
        <Msg state={state} />
      </form>
    </details>
  );
}
