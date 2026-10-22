"use client";

import { useActionState, useEffect, useState } from "react";
import { saveTiktokAction } from "@/app/portal/[marca]/actions";
import { Msg } from "@/components/ui/msg";
import { TikTokIcon } from "@/components/ui/social-icons";
import { ui } from "@/components/ui/styles";

const KEY = "cc-tiktok-later";
const LATER_DAYS = 30;

/** Pede o @ do TikTok a quem ainda não informou (CP-150). "Agora não" esconde por 30 dias neste aparelho. */
export function TiktokAsk({ marca }: { marca: string }) {
  const [state, action, pending] = useActionState(saveTiktokAction, undefined);
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
        <span className="grid size-9 shrink-0 place-content-center rounded-2xl bg-brand/10 text-brand dark:bg-brand-2/15 dark:text-brand-2"><TikTokIcon className="size-4" /></span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">Qual é o seu TikTok?</span>
          <span className={ui.hint}>Assim a equipe acompanha os seus conteúdos por lá também.</span>
        </span>
      </div>
      {state?.ok ? (
        <Msg state={state} />
      ) : (
        <form action={action} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="marca" value={marca} />
          <input className={`${ui.input} min-w-0 flex-1`} name="tiktok" placeholder="@seuperfil" autoCapitalize="none" autoComplete="off" required aria-label="@ do TikTok" />
          <button className={ui.btnSm} disabled={pending}>Salvar</button>
          <button type="button" onClick={later} className={ui.ghostSm}>Agora não</button>
          <Msg state={state} />
        </form>
      )}
    </section>
  );
}
