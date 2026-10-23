"use client";

import { useActionState, useRef } from "react";
import { CopyButton } from "@/components/portal/copy-button";
import { Msg } from "@/components/ui/msg";
import { ui } from "@/components/ui/styles";
import { PROSPECT_STATUS_LABEL, PROSPECT_STATUSES, type ProspectStatusKey } from "@/domain";
import { addProspectsAction, saveProspectMessagesAction, updateProspectAction, type ProspectState } from "./actions";

function Warn({ state }: { state: ProspectState }) {
  if (!state?.warn?.length) return null;
  return (
    <ul className="rounded-2xl border border-amber-400/60 bg-amber-100/70 p-3 text-sm text-amber-950 dark:bg-amber-900/30 dark:text-amber-100">
      {state.warn.map((w) => <li key={w}>{w}</li>)}
    </ul>
  );
}

/** U6 (D-PROSPECT): registrar um ou vários @ abordados no dia. */
export function AddProspectsForm({ brandId, today }: { brandId: string; today: string }) {
  const [state, action, pending] = useActionState(addProspectsAction, undefined);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="brandId" value={brandId} />
      <label className={ui.label}>
        @ do Instagram (um por linha; pode colar vários)
        <textarea name="handles" required rows={4} placeholder={"@perfil1\n@perfil2"} className={ui.input} />
      </label>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className={ui.label}>Dia da abordagem<input type="date" name="approachedOn" defaultValue={today} max={today} required className={ui.input} /></label>
        <label className={ui.label}>
          Situação
          <select name="status" defaultValue="FIRST_MESSAGE" className={ui.input}>
            {PROSPECT_STATUSES.filter((s) => s !== "SIGNED_UP").map((s) => <option key={s} value={s}>{PROSPECT_STATUS_LABEL[s]}</option>)}
          </select>
        </label>
        <label className={ui.label}>Observação (opcional)<input name="note" maxLength={500} placeholder="ex.: em contato pelo WhatsApp" className={ui.input} /></label>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button disabled={pending} className={ui.btn}>{pending ? "Registrando…" : "Registrar"}</button>
        <Msg state={state} />
      </div>
      <Warn state={state} />
    </form>
  );
}

/** Situação de um perfil: muda ao escolher. */
export function StatusSelect({ id, status, locked }: { id: string; status: ProspectStatusKey; locked: boolean }) {
  const [state, action, pending] = useActionState(updateProspectAction, undefined);
  const form = useRef<HTMLFormElement>(null);
  return (
    <form ref={form} action={action} className="flex items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <select name="status" defaultValue={status} disabled={locked || pending} onChange={() => form.current?.requestSubmit()} aria-label="Situação" className={ui.inputSm}>
        {PROSPECT_STATUSES.map((s) => <option key={s} value={s}>{PROSPECT_STATUS_LABEL[s]}</option>)}
      </select>
      {state?.error && <span className="text-xs text-red-700 dark:text-red-400">{state.error}</span>}
    </form>
  );
}

export function NoteForm({ id, note }: { id: string; note: string | null }) {
  const [state, action, pending] = useActionState(updateProspectAction, undefined);
  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <input name="note" defaultValue={note ?? ""} maxLength={500} placeholder="observação" aria-label="Observação" className={`${ui.inputSm} min-w-0 flex-1`} />
      <button disabled={pending} className={ui.ghostSm}>Salvar</button>
      {state?.error ? <span className="text-xs text-red-700 dark:text-red-400">{state.error}</span> : state?.ok ? <span className="text-xs text-stone-500">ok</span> : null}
    </form>
  );
}

/** Mensagem pronta para copiar (já com o nome de quem manda e o link de inscrição). */
export function MessageBox({ title, text }: { title: string; text: string }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{title}</span>
        <CopyButton value={text} label="Copiar" />
      </div>
      <p className="whitespace-pre-line rounded-2xl bg-stone-100/70 p-3 text-sm dark:bg-white/5">{text}</p>
    </div>
  );
}

export function MessagesForm({ brandId, first, proposal }: { brandId: string; first: string; proposal: string }) {
  const [state, action, pending] = useActionState(saveProspectMessagesAction, undefined);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="brandId" value={brandId} />
      <p className={ui.hint}>
        Use {"{EU}"} (primeiro nome de quem manda), {"{MARCA}"}, {"{LINK}"} (link de inscrição de quem manda), {"{DESCONTO}"} e {"{COMISSAO}"} (os padrões da marca). Apagar o texto volta ao padrão.
      </p>
      <label className={ui.label}>Mensagem inicial<textarea name="first" defaultValue={first} rows={6} maxLength={2000} className={ui.input} /></label>
      <label className={ui.label}>Proposta (depois que ela responde)<textarea name="proposal" defaultValue={proposal} rows={10} maxLength={2000} className={ui.input} /></label>
      <div className="flex items-center gap-3">
        <button disabled={pending} className={ui.btnSm}>Salvar mensagens</button>
        <Msg state={state} />
      </div>
    </form>
  );
}
