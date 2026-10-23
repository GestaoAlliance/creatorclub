"use client";

import { useActionState } from "react";
import { Msg } from "@/components/ui/msg";
import { ui } from "@/components/ui/styles";
import { createApplicationAction } from "../actions";

/** Formulário da "Nova candidata" (M4.1): o essencial para aprovar depois; o resto ela completa no portal. */
export function NewApplicationForm() {
  const [state, action, pending] = useActionState(createApplicationAction, undefined);
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <label className={`${ui.label} sm:col-span-2`}>
        Nome completo
        <input name="fullName" required maxLength={120} className={ui.input} />
      </label>
      <label className={ui.label}>
        WhatsApp (com DDD)
        <input name="phone" required inputMode="tel" placeholder="(11) 91234-5678" className={ui.input} />
      </label>
      <label className={ui.label}>
        E-mail
        <input name="email" type="email" placeholder="opcional; pedido na aprovação" className={ui.input} />
      </label>
      <label className={ui.label}>
        Instagram
        <input name="instagram" placeholder="@" className={ui.input} />
      </label>
      <label className={ui.label}>
        TikTok
        <input name="tiktok" placeholder="@" className={ui.input} />
      </label>
      <label className={ui.label}>
        Seguidores
        <input name="followers" placeholder="ex.: 12 mil" className={ui.input} />
      </label>
      <label className={ui.label}>
        Tipo
        <select name="category" defaultValue="INFLUENCER" className={ui.input}>
          <option value="INFLUENCER">Influencer</option>
          <option value="UGC">UGC</option>
          <option value="PRESCRITOR">Prescritor</option>
        </select>
      </label>
      <label className={ui.label}>
        Sugestão de cupom
        <input name="suggestedCoupon" maxLength={40} className={`${ui.input} font-mono uppercase`} />
      </label>
      <label className={`${ui.label} sm:col-span-2`}>
        Observação (só a equipe vê)
        <input name="note" maxLength={300} placeholder="ex.: indicada pela Fátima no evento" className={ui.input} />
      </label>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <button className={ui.btn} disabled={pending}>{pending ? "Cadastrando…" : "Cadastrar candidata"}</button>
        <Msg state={state} />
      </div>
    </form>
  );
}
