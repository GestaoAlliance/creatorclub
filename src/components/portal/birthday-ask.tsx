"use client";

import { Cake } from "lucide-react";
import { useActionState, useEffect, useState } from "react";
import { saveBirthDateAction } from "@/app/portal/[marca]/actions";
import { Msg } from "@/components/ui/msg";
import { ui } from "@/components/ui/styles";

const KEY = "cc-birthday-later";
const LATER_DAYS = 30;

/** Pede o aniversário a quem ainda não informou (M4.2, D-TAGS). "Agora não" esconde por 30 dias neste aparelho. */
export function BirthdayAsk({ marca, brandName }: { marca: string; brandName: string }) {
  const [state, action, pending] = useActionState(saveBirthDateAction, undefined);
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    try {
      const until = Number(localStorage.getItem(KEY) ?? 0);
      if (until > Date.now()) setHidden(true);
    } catch {}
  }, []);
  function later() {
    setHidden(true);
    try {
      localStorage.setItem(KEY, String(Date.now() + LATER_DAYS * 86_400_000));
    } catch {}
  }
  if (hidden) return null;
  return (
    <section className="glass flex flex-col gap-3 rounded-3xl p-4 md:p-5">
      <div className="flex items-center gap-3">
        <span className="grid size-9 shrink-0 place-content-center rounded-2xl bg-brand/10 text-brand dark:bg-brand-2/15 dark:text-brand-2"><Cake className="size-4" /></span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">Quando é o seu aniversário?</span>
          <span className={ui.hint}>Para a equipe da {brandName} comemorar com você.</span>
        </span>
      </div>
      {state?.ok ? (
        <Msg state={state} />
      ) : (
        <form action={action} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="marca" value={marca} />
          <input className={`${ui.input} min-w-0 flex-1`} name="birthDate" type="date" required aria-label="Data de nascimento" />
          <button className={ui.btnSm} disabled={pending}>Salvar</button>
          <button type="button" onClick={later} className={ui.ghostSm}>Agora não</button>
          <Msg state={state} />
        </form>
      )}
    </section>
  );
}
