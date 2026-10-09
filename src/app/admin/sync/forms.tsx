"use client";

import { useActionState } from "react";
import { backfillAction, connectAction, syncNowAction, type FormState } from "./actions";

const input = "w-full rounded border border-stone-300 px-3 py-2";
const button = "rounded bg-brand px-3 py-2 text-sm font-semibold text-white disabled:opacity-60";

function Status({ state }: { state: FormState }) {
  if (state?.error) return <p role="alert" className="text-sm text-red-700">{state.error}</p>;
  if (state?.ok) return <p className="text-sm text-green-800">{state.ok}</p>;
  return null;
}

export function ConnectForm({ brandId, shop }: { brandId: string; shop: string | null }) {
  const [state, action, pending] = useActionState(connectAction, undefined);
  return (
    <form action={action} className="flex flex-col gap-2" autoComplete="off">
      <input type="hidden" name="brandId" value={brandId} />
      <label className="flex flex-col gap-1 text-sm">Loja (domínio .myshopify.com)
        <input className={input} name="shop" defaultValue={shop ?? ""} placeholder="minha-loja.myshopify.com" required />
      </label>
      <label className="flex flex-col gap-1 text-sm">Client ID
        <input className={input} name="clientId" required />
      </label>
      <label className="flex flex-col gap-1 text-sm">Client secret
        <input className={input} name="clientSecret" type="password" required />
      </label>
      <Status state={state} />
      <button className={button} disabled={pending}>{pending ? "Conectando…" : shop ? "Reconectar loja" : "Conectar loja"}</button>
    </form>
  );
}

export function SyncNowForm({ brandId }: { brandId: string }) {
  const [state, action, pending] = useActionState(syncNowAction, undefined);
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="brandId" value={brandId} />
      <button className={button} disabled={pending}>Sincronizar agora</button>
      <Status state={state} />
    </form>
  );
}

export function BackfillForm({ brandId }: { brandId: string }) {
  const [state, action, pending] = useActionState(backfillAction, undefined);
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="brandId" value={brandId} />
      <label className="flex flex-col gap-1 text-sm">Importar pedidos criados desde (dia, horário de Brasília)
        <input className={input} name="since" type="date" required />
      </label>
      <button className={button} disabled={pending}>Importar histórico</button>
      <Status state={state} />
    </form>
  );
}
