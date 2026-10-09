"use client";

import { MapPin } from "lucide-react";
import { useActionState, useEffect, useState } from "react";
import { saveAddressAction } from "@/app/portal/[marca]/envios/actions";
import { formatAddress, UFS, type Address } from "@/lib/shipments/address";

const field = "w-full rounded-2xl border border-stone-300/70 bg-white/70 px-3 py-2.5 text-sm outline-none focus:border-brand dark:border-white/15 dark:bg-white/5";

/** Endereço de entrega (D-SHIPADDR): a creator mantém; cada envio guarda a cópia do endereço do dia. */
export function AddressCard({ marca, address, viewOnly }: { marca: string; address: Address | null; viewOnly: boolean }) {
  const [editing, setEditing] = useState(address === null && !viewOnly);
  const [state, action, pending] = useActionState(saveAddressAction, undefined);
  const saved = state?.ok && !pending;
  useEffect(() => {
    if (state?.ok) setEditing(false);
  }, [state]);

  return (
    <section className="glass flex flex-col gap-4 rounded-3xl p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-semibold"><MapPin className="size-4" /> Endereço de entrega</h2>
        {!editing && !viewOnly && (
          <button type="button" onClick={() => setEditing(true)} className="glass rounded-full px-4 py-1.5 text-xs font-semibold">
            {address ? "Alterar" : "Cadastrar"}
          </button>
        )}
      </div>
      {saved && !editing && <p role="status" className="text-sm text-emerald-700 dark:text-emerald-300">{state.ok}</p>}
      {!editing ? (
        address ? (
          <div className="rounded-2xl bg-white/50 px-4 py-3 text-sm dark:bg-white/5">
            {formatAddress(address).map((l) => <p key={l}>{l}</p>)}
          </div>
        ) : (
          <p className="text-sm text-stone-600 dark:text-stone-400">
            {viewOnly ? "A creator ainda não cadastrou o endereço." : "Cadastre seu endereço para a equipe poder te enviar produtos."}
          </p>
        )
      ) : (
        <form action={action} className="grid grid-cols-6 gap-3">
          <input type="hidden" name="marca" value={marca} />
          <label className="col-span-3 flex flex-col gap-1 text-xs text-stone-500 md:col-span-2">
            CEP
            <input name="zip" defaultValue={address?.zip ?? ""} inputMode="numeric" autoComplete="postal-code" required className={field} />
          </label>
          <label className="col-span-3 flex flex-col gap-1 text-xs text-stone-500 md:col-span-1">
            UF
            <select name="state" defaultValue={address?.state ?? ""} required className={field}>
              <option value="" disabled>—</option>
              {UFS.map((uf) => <option key={uf} value={uf}>{uf}</option>)}
            </select>
          </label>
          <label className="col-span-6 flex flex-col gap-1 text-xs text-stone-500 md:col-span-3">
            Cidade
            <input name="city" defaultValue={address?.city ?? ""} autoComplete="address-level2" required className={field} />
          </label>
          <label className="col-span-6 flex flex-col gap-1 text-xs text-stone-500 md:col-span-4">
            Rua
            <input name="street" defaultValue={address?.street ?? ""} autoComplete="address-line1" required className={field} />
          </label>
          <label className="col-span-2 flex flex-col gap-1 text-xs text-stone-500 md:col-span-2">
            Número
            <input name="number" defaultValue={address?.number ?? ""} required className={field} />
          </label>
          <label className="col-span-4 flex flex-col gap-1 text-xs text-stone-500 md:col-span-3">
            Complemento
            <input name="complement" defaultValue={address?.complement ?? ""} autoComplete="address-line2" className={field} />
          </label>
          <label className="col-span-6 flex flex-col gap-1 text-xs text-stone-500 md:col-span-3">
            Bairro
            <input name="district" defaultValue={address?.district ?? ""} required className={field} />
          </label>
          {state?.error && <p role="alert" className="col-span-6 text-sm text-red-700 dark:text-red-400">{state.error}</p>}
          <div className="col-span-6 flex gap-3">
            <button disabled={pending} className="rounded-full bg-brand px-6 py-2.5 text-sm font-semibold text-white shadow-sm disabled:opacity-60">
              {pending ? "Salvando…" : "Salvar endereço"}
            </button>
            {address && (
              <button type="button" onClick={() => setEditing(false)} className="glass rounded-full px-5 py-2.5 text-sm">Cancelar</button>
            )}
          </div>
        </form>
      )}
    </section>
  );
}
