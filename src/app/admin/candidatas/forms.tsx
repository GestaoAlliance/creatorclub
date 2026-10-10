"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Msg } from "@/components/ui/msg";
import { ui } from "@/components/ui/styles";
import { approveAction, rejectAction } from "./actions";

const CATEGORY = { INFLUENCER: "Influencer", PRESCRITOR: "Prescritor", UGC: "UGC" } as const;

/** Aprovar: cupom (sugestão já ajustada), tipo, comissão e desconto editáveis; depois mostra o convite. */
export function ApproveForm(p: { applicationId: string; name: string; email: string | null; coupon: string; category: keyof typeof CATEGORY }) {
  const [state, action, pending] = useActionState(approveAction, undefined);
  const [copied, setCopied] = useState(false);
  if (state?.ok) {
    const o = state.ok;
    return (
      <div className="flex flex-col gap-2 rounded-2xl border border-emerald-400/50 bg-emerald-100/70 p-4 text-sm text-emerald-950 dark:bg-emerald-900/30 dark:text-emerald-100">
        <p><strong>{p.name}</strong> agora é creator, com o cupom <strong className="font-mono">{o.coupon}</strong>.</p>
        <p>Crie o cupom <strong className="font-mono">{o.coupon}</strong> na loja Shopify (combinável com outros descontos). Em breve isso será automático.</p>
        {o.link ? (
          <>
            <p>Convite do portal (aparece só agora; vale 7 dias, uma vez). Mande pelo WhatsApp:</p>
            <code className="break-all font-mono text-xs">{o.link}</code>
            <button type="button" className={`${ui.ghostSm} self-start`} onClick={() => { void navigator.clipboard.writeText(o.link!); setCopied(true); }}>
              {copied ? "Copiado" : "Copiar convite"}
            </button>
          </>
        ) : (
          <p>Convite não gerado: {o.inviteError}</p>
        )}
        <Link href={`/admin/creators/${o.creatorId}`} className={`${ui.link} self-start`}>Abrir a ficha</Link>
      </div>
    );
  }
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="applicationId" value={p.applicationId} />
      <input type="hidden" name="name" value={p.name} />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <label className={ui.label}>
          Cupom
          <input name="coupon" defaultValue={p.coupon} required maxLength={8} className={`${ui.inputSm} font-mono uppercase`} />
        </label>
        <label className={ui.label}>
          Tipo
          <select name="category" defaultValue={p.category} className={ui.inputSm}>
            {Object.entries(CATEGORY).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <label className={ui.label}>
          Comissão %
          <input name="rate" defaultValue="15" inputMode="decimal" required className={ui.inputSm} />
        </label>
        <label className={ui.label}>
          Desconto %
          <input name="discount" defaultValue="5" inputMode="decimal" required className={ui.inputSm} />
        </label>
        <label className={`${ui.label} col-span-full`}>
          E-mail do convite
          <input name="email" type="email" defaultValue={p.email ?? ""} required className={ui.inputSm} />
        </label>
      </div>
      <Msg state={state?.error ? { error: state.error } : undefined} />
      <button className={`${ui.btn} self-start`} disabled={pending}>{pending ? "Aprovando…" : "Aprovar e gerar convite"}</button>
    </form>
  );
}

export function RejectForm({ applicationId }: { applicationId: string }) {
  const [state, action, pending] = useActionState(rejectAction, undefined);
  return (
    <details>
      <summary className="cursor-pointer text-xs text-stone-500 hover:underline">Recusar</summary>
      <form action={action} className="mt-2 flex flex-col gap-1.5">
        <input type="hidden" name="applicationId" value={applicationId} />
        <div className="flex gap-2">
          <input name="note" maxLength={300} placeholder="Motivo (opcional, só a equipe vê)" className={`${ui.inputSm} min-w-0 flex-1`} />
          <button className={ui.dangerSm} disabled={pending}>Recusar</button>
        </div>
        <Msg state={state} />
      </form>
    </details>
  );
}
