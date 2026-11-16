"use client";

import { CalendarClock, RotateCcw } from "lucide-react";
import { useActionState, useState } from "react";
import { checkCalendar, checkExtension, type CalendarDays } from "@/domain";
import { Msg } from "@/components/ui/msg";
import { PayCalendar } from "@/components/ui/pay-calendar";
import { ui } from "@/components/ui/styles";
import { calendarAction, cancelExtensionAction, extendWindowAction } from "./actions";

const n = (v: string) => (v.trim() === "" ? null : Number(v));

/** D-CALENDAR: datas de pagamento da marca, com a prévia do mês e as conferências antes de salvar. */
export function CalendarForm({ brandId, month, days, normalEnd, extended, today }: { brandId: string; month: string; days: CalendarDays; normalEnd: number; extended: boolean; today: number }) {
  const [v, setV] = useState({ start: String(days.start), end: String(normalEnd), payFrom: days.payFrom === null ? "" : String(days.payFrom), payBy: String(days.payBy) });
  const [ext, setExt] = useState(String(Math.min(normalEnd + 7, days.payBy - 1)));
  const [state, action, pending] = useActionState(calendarAction, undefined);
  const [extState, extAction, extPending] = useActionState(extendWindowAction, undefined);
  const [backState, backAction, backPending] = useActionState(cancelExtensionAction, undefined);
  const draft: CalendarDays = { start: n(v.start) ?? 0, end: n(v.end) ?? 0, payFrom: n(v.payFrom), payBy: n(v.payBy) ?? 0 };
  const problems = checkCalendar(draft);
  const changed = draft.start !== days.start || draft.end !== normalEnd || draft.payFrom !== days.payFrom || draft.payBy !== days.payBy;
  const preview: CalendarDays = problems.length ? { ...days } : { ...draft, end: extended && draft.end < days.end && draft.payBy > days.end ? days.end : draft.end };
  const extProblem = checkExtension(days, normalEnd, Number(ext));
  const field = (k: keyof typeof v, label: string, hint?: string) => (
    <label className={ui.label}>
      {label}
      <input type="number" min={1} max={28} inputMode="numeric" name={k} value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} placeholder={hint} className={`${ui.input} w-24`} />
    </label>
  );
  return (
    <div className="@container flex flex-col gap-5">
      <PayCalendar month={month} days={preview} normalEnd={problems.length ? normalEnd : draft.end} today={today} />

      <form
        action={action}
        onSubmit={(e) => {
          if (!confirm("Salvar as novas datas? Elas valem na hora: portal das creators, avisos e pedidos de saque.")) e.preventDefault();
        }}
        className="flex flex-col gap-3 rounded-2xl bg-stone-500/5 p-4"
      >
        <input type="hidden" name="brandId" value={brandId} />
        <p className="text-sm font-semibold">Datas de todo mês</p>
        <div className="flex flex-wrap items-end gap-3">
          <fieldset className="flex items-end gap-2"><legend className="mb-1 text-xs font-medium text-stone-500">Pedido de saque (nota ou recibo)</legend>{field("start", "do dia")}{field("end", "ao dia")}</fieldset>
          <fieldset className="flex items-end gap-2"><legend className="mb-1 text-xs font-medium text-stone-500">Pagamento</legend>{field("payFrom", "do dia", "—")}{field("payBy", "ao dia")}</fieldset>
        </div>
        {problems.length > 0 && <ul className="list-disc pl-5 text-sm text-red-700 dark:text-red-400">{problems.map((p) => <li key={p}>{p}</li>)}</ul>}
        <p className={ui.hint}>Dias de 1 a 28 (todo mês tem). O fechamento é sempre no dia 1. O mínimo para liberar a comissão segue o contrato de cada creator.</p>
        <div className="flex flex-wrap items-center gap-2">
          <button className={ui.btnSm} disabled={pending || problems.length > 0 || !changed}>{pending ? "Salvando…" : "Salvar datas"}</button>
          {changed && <button type="button" onClick={() => setV({ start: String(days.start), end: String(normalEnd), payFrom: days.payFrom === null ? "" : String(days.payFrom), payBy: String(days.payBy) })} className={ui.ghostSm}>Desfazer</button>}
        </div>
        <Msg state={state} />
      </form>

      <div className="flex flex-col gap-3 rounded-2xl bg-amber-500/8 p-4">
        <p className="flex items-center gap-2 text-sm font-semibold"><CalendarClock className="size-4" />Só este mês</p>
        {extended ? (
          <form action={backAction} className="flex flex-col gap-2">
            <input type="hidden" name="brandId" value={brandId} />
            <p className="text-sm">O pedido de saque deste mês vai <strong>até o dia {days.end}</strong> (o normal é o dia {normalEnd}). No dia 1 do próximo mês volta sozinho ao dia {normalEnd}.</p>
            <button className={`${ui.ghostSm} self-start`} disabled={backPending}><RotateCcw className="size-3.5" />{backPending ? "Voltando…" : `Voltar ao dia ${normalEnd} agora`}</button>
            <Msg state={backState} />
          </form>
        ) : (
          <form
            action={extAction}
            onSubmit={(e) => {
              if (!confirm(`Estender o pedido de saque deste mês até o dia ${ext}? No mês que vem volta sozinho ao dia ${normalEnd}.`)) e.preventDefault();
            }}
            className="flex flex-col gap-2"
          >
            <input type="hidden" name="brandId" value={brandId} />
            <div className="flex flex-wrap items-end gap-2">
              <label className={ui.label}>
                Estender o pedido de saque até o dia
                <input type="number" name="endDay" min={normalEnd + 1} max={Math.min(28, days.payBy - 1)} value={ext} onChange={(e) => setExt(e.target.value)} className={`${ui.input} w-24`} />
              </label>
              <button className={ui.btnSm} disabled={extPending || extProblem !== null}>{extPending ? "Salvando…" : "Estender só este mês"}</button>
            </div>
            {extProblem && <p className="text-sm text-red-700 dark:text-red-400">{extProblem}</p>}
            <p className={ui.hint}>Para quando muita creator ainda não mandou a nota. Vale só neste mês e volta sozinho ao normal no dia 1; fica no histórico.</p>
            <Msg state={extState} />
          </form>
        )}
      </div>
    </div>
  );
}
