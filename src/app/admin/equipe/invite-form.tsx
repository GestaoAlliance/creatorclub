"use client";

import { useActionState, useState } from "react";
import { inviteAction } from "./actions";

const input = "w-full rounded border border-stone-300 px-3 py-2";

export function InviteForm({ brands }: { brands: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState(inviteAction, undefined);
  const [role, setRole] = useState("SUPER_ADMIN");
  const [copied, setCopied] = useState(false);
  const noBrands = brands.length === 0;
  return (
    <div className="flex flex-col gap-3">
      <form action={action} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">Nome
          <input className={input} name="name" required />
        </label>
        <label className="flex flex-col gap-1 text-sm">E-mail
          <input className={input} name="email" type="email" required />
        </label>
        <label className="flex flex-col gap-1 text-sm">Papel
          <select className={input} name="role" value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="SUPER_ADMIN">Super admin (todas as marcas)</option>
            <option value="GESTAO" disabled={noBrands}>Gestão</option>
            <option value="ENVIO" disabled={noBrands}>Envio</option>
            <option value="PAGAMENTO" disabled={noBrands}>Pagamento</option>
            <option value="HUNTER" disabled={noBrands}>Hunter</option>
          </select>
        </label>
        {role !== "SUPER_ADMIN" && (
          <label className="flex flex-col gap-1 text-sm">Marca
            <select className={input} name="brandId" required>
              {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </label>
        )}
        {noBrands && <p className="text-xs text-stone-500">Os outros papéis aparecem quando a marca for cadastrada.</p>}
        {state?.error && <p role="alert" className="text-sm text-red-700">{state.error}</p>}
        <button className="rounded bg-brand px-3 py-2 font-semibold text-white disabled:opacity-60" disabled={pending}>
          {pending ? "Gerando..." : "Gerar convite"}
        </button>
      </form>
      {state?.link && (
        <div className="flex flex-col gap-2 rounded border border-green-300 bg-green-50 p-3 text-sm">
          <p>Convite para <strong>{state.email}</strong>. Copie e envie (aparece só agora; vale 7 dias, uma vez):</p>
          <code className="break-all">{state.link}</code>
          <button
            type="button"
            className="self-start rounded border border-stone-300 px-3 py-1"
            onClick={async () => {
              await navigator.clipboard.writeText(state.link!);
              setCopied(true);
            }}
          >
            {copied ? "Copiado" : "Copiar link"}
          </button>
        </div>
      )}
    </div>
  );
}
