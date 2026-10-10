"use client";

import { useActionState } from "react";
import { Msg as Status } from "@/components/ui/msg";
import { ui } from "@/components/ui/styles";
import { backfillAction, connectAction, syncNowAction } from "./actions";

const input = ui.input;
const button = `${ui.btn} self-start`;

export function ConnectForm({ brandId, shop }: { brandId: string; shop: string | null }) {
  const [state, action, pending] = useActionState(connectAction, undefined);
  return (
    <form action={action} className="flex flex-col gap-3" autoComplete="off">
      <input type="hidden" name="brandId" value={brandId} />
      <label className={ui.label}>Loja (domínio .myshopify.com)
        <input className={input} name="shop" defaultValue={shop ?? ""} placeholder="minha-loja.myshopify.com" required />
      </label>
      {shop && <p className={ui.hint}>Deixe Client ID e Client secret em branco para usar os já guardados (ex.: depois de mudar as permissões do app).</p>}
      <label className={ui.label}>Client ID
        <input className={input} name="clientId" required={!shop} />
      </label>
      <label className={ui.label}>Client secret
        <input className={input} name="clientSecret" type="password" required={!shop} />
      </label>
      <Status state={state} />
      <button className={button} disabled={pending}>{pending ? "Conectando…" : shop ? "Reconectar loja" : "Conectar loja"}</button>
    </form>
  );
}

export function SyncNowForm({ brandId }: { brandId: string }) {
  const [state, action, pending] = useActionState(syncNowAction, undefined);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="brandId" value={brandId} />
      <button className={button} disabled={pending}>Sincronizar agora</button>
      <Status state={state} />
    </form>
  );
}

export function BackfillForm({ brandId }: { brandId: string }) {
  const [state, action, pending] = useActionState(backfillAction, undefined);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="brandId" value={brandId} />
      <label className={ui.label}>Importar pedidos criados desde (dia, horário de Brasília)
        <input className={input} name="since" type="date" required />
      </label>
      <button className={button} disabled={pending}>Importar histórico</button>
      <Status state={state} />
    </form>
  );
}
