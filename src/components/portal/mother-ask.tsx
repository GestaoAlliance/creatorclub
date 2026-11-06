"use client";

import { CreditCard } from "lucide-react";
import { useActionState } from "react";
import { saveMotherNameAction } from "@/app/portal/[marca]/actions";
import { Msg } from "@/components/ui/msg";
import { ui } from "@/components/ui/styles";

/** D-ALELOCARD: pessoa física sem o nome da mãe (a Alelo pede para emitir o cartão onde ela recebe a comissão). */
export function MotherAsk({ marca }: { marca: string }) {
  const [state, action, pending] = useActionState(saveMotherNameAction, undefined);
  return (
    <section className="glass flex flex-col gap-3 rounded-3xl p-4 md:p-5">
      <div className="flex items-center gap-3">
        <span className="grid size-9 shrink-0 place-content-center rounded-2xl bg-brand/10 text-brand dark:bg-brand-2/15 dark:text-brand-2"><CreditCard className="size-4" /></span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">Qual o nome completo da sua mãe?</span>
          <span className={ui.hint}>A Alelo pede para emitir o cartão onde você recebe a sua comissão.</span>
        </span>
      </div>
      {state?.ok ? (
        <Msg state={state} />
      ) : (
        <form action={action} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="marca" value={marca} />
          <input className={`${ui.input} min-w-0 flex-1`} name="motherName" required maxLength={120} autoComplete="off" aria-label="Nome completo da sua mãe" />
          <button className={ui.btnSm} disabled={pending}>Salvar</button>
          <Msg state={state} />
        </form>
      )}
    </section>
  );
}
