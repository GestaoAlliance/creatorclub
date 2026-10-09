"use client";

import { useActionState, useState } from "react";
import { adjustAction, contactAction, inviteAction, rateAction, statusAction, type State } from "./actions";

const input = "w-full rounded border border-stone-300 px-3 py-2";
const btn = "rounded bg-brand px-3 py-2 text-sm font-semibold text-white disabled:opacity-60";

function Msg({ state }: { state: State }) {
  if (state?.error) return <p role="alert" className="text-sm text-red-700">{state.error}</p>;
  if (state?.ok) return <p className="text-sm text-green-800">{state.ok}</p>;
  return null;
}

export function ContactForm(p: { creatorId: string; name: string; email: string; phone: string | null; fakeEmail: boolean }) {
  const [state, action, pending] = useActionState(contactAction, undefined);
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="creatorId" value={p.creatorId} />
      <label className="flex flex-col gap-1 text-sm">Nome<input className={input} name="name" defaultValue={p.name} required /></label>
      <label className="flex flex-col gap-1 text-sm">E-mail
        <input className={input} name="email" type="email" defaultValue={p.fakeEmail ? "" : p.email} placeholder={p.fakeEmail ? "e-mail real (o do app antigo era falso)" : ""} required />
      </label>
      <label className="flex flex-col gap-1 text-sm">Telefone<input className={input} name="phone" defaultValue={p.phone ?? ""} /></label>
      <Msg state={state} />
      <button className={btn} disabled={pending}>Salvar contato</button>
    </form>
  );
}

export function StatusForm({ creatorId, status, labels }: { creatorId: string; status: string; labels: Record<string, string> }) {
  const [state, action, pending] = useActionState(statusAction, undefined);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="creatorId" value={creatorId} />
      <select className="rounded border border-stone-300 px-3 py-2 text-sm" name="status" defaultValue={status}>
        {Object.entries(labels).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
      <button className={btn} disabled={pending}>Salvar situação</button>
      <Msg state={state} />
    </form>
  );
}

export function RateChangeForm({ creatorId }: { creatorId: string }) {
  const [state, action, pending] = useActionState(rateAction, undefined);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="creatorId" value={creatorId} />
      <input className="w-20 rounded border border-stone-300 px-3 py-2 text-sm" name="rate" placeholder="15" inputMode="decimal" required />%
      <button className={btn} disabled={pending}>Mudar taxa a partir de agora</button>
      <Msg state={state} />
    </form>
  );
}

export function InviteButton({ creatorId, accountId }: { creatorId: string; accountId: string }) {
  const [state, action, pending] = useActionState(inviteAction, undefined);
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      <form action={action}>
        <input type="hidden" name="creatorId" value={creatorId} />
        <input type="hidden" name="accountId" value={accountId} />
        <button className={btn} disabled={pending}>Gerar link de convite</button>
      </form>
      <Msg state={state} />
      {state?.link && (
        <div className="flex flex-col gap-1 text-sm">
          <p>Link de uso único (vale 7 dias). Envie pelo WhatsApp; ele não aparece de novo.</p>
          <code className="break-all rounded bg-stone-100 p-2">{state.link}</code>
          <button type="button" className="self-start text-sm underline" onClick={() => { void navigator.clipboard.writeText(state.link!); setCopied(true); }}>
            {copied ? "Copiado" : "Copiar link"}
          </button>
        </div>
      )}
    </div>
  );
}

export function AdjustForm({ creatorId, requestId }: { creatorId: string; requestId: string }) {
  const [state, action, pending] = useActionState(adjustAction, undefined);
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="creatorId" value={creatorId} />
      <input type="hidden" name="requestId" value={requestId} />
      <label className="flex flex-col gap-1 text-sm">Valor (R$; negativo para descontar)
        <input className={input} name="amount" placeholder="150,00 ou -20,50" inputMode="decimal" required />
      </label>
      <label className="flex flex-col gap-1 text-sm">Motivo (aparece no extrato)
        <input className={input} name="reason" minLength={5} required />
      </label>
      <Msg state={state} />
      <button className={btn} disabled={pending}>Lançar ajuste</button>
    </form>
  );
}
