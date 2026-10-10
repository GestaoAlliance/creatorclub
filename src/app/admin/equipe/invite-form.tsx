"use client";

import { useActionState, useState } from "react";
import { ui } from "@/components/ui/styles";
import { inviteAction } from "./actions";

const input = ui.input;

export function InviteForm({ brands }: { brands: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState(inviteAction, undefined);
  const [role, setRole] = useState("SUPER_ADMIN");
  const [copied, setCopied] = useState(false);
  const noBrands = brands.length === 0;
  return (
    <div className="flex flex-col gap-4">
      <form action={action} className="flex flex-col gap-4">
        <label className={ui.label}>Nome
          <input className={input} name="name" required />
        </label>
        <label className={ui.label}>E-mail
          <input className={input} name="email" type="email" required />
        </label>
        <label className={ui.label}>Papel
          <select className={input} name="role" value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="SUPER_ADMIN">Super admin (todas as marcas)</option>
            <option value="GESTAO" disabled={noBrands}>Gestão</option>
            <option value="ENVIO" disabled={noBrands}>Envio</option>
            <option value="PAGAMENTO" disabled={noBrands}>Pagamento</option>
            <option value="HUNTER" disabled={noBrands}>Hunter</option>
          </select>
        </label>
        {role !== "SUPER_ADMIN" && (
          <label className={ui.label}>Marca
            <select className={input} name="brandId" required>
              {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </label>
        )}
        {noBrands && <p className={ui.hint}>Os outros papéis aparecem quando a marca for cadastrada.</p>}
        {state?.error && <p role="alert" className={ui.error}>{state.error}</p>}
        <button className={`${ui.btn} self-start`} disabled={pending}>
          {pending ? "Gerando..." : "Gerar convite"}
        </button>
      </form>
      {state?.link && (
        <div className="flex flex-col gap-2 rounded-2xl border border-emerald-400/50 bg-emerald-100/70 p-4 text-sm text-emerald-950 dark:bg-emerald-900/30 dark:text-emerald-100">
          <p>Convite para <strong>{state.email}</strong>. Copie e envie (aparece só agora; vale 7 dias, uma vez):</p>
          <code className="break-all font-mono text-xs">{state.link}</code>
          <button
            type="button"
            className={`${ui.ghostSm} self-start`}
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
