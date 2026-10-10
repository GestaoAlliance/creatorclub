"use client";

import { FileSignature } from "lucide-react";
import { useActionState } from "react";
import { acceptTermsAction } from "@/app/portal/[marca]/termo/actions";
import { Msg } from "@/components/ui/msg";
import { ui } from "@/components/ui/styles";

/** Bloqueio do portal até a creator aceitar a versão mais nova do termo (D-TERMS). */
export function TermsGate({
  marca,
  brandName,
  terms,
  defaultName,
  renewal,
}: {
  marca: string;
  brandName: string;
  terms: { id: string; version: number; title: string; body: string };
  defaultName: string;
  renewal: boolean;
}) {
  const [state, action, pending] = useActionState(acceptTermsAction, undefined);
  return (
    <section className={`${ui.card} mx-auto w-full max-w-3xl`}>
      <span className={`${ui.pillOn} self-start`}>{renewal ? "Termo atualizado" : "Falta 1 passo"}</span>
      <div className="flex flex-col gap-1">
        <h1 className={`${ui.title} flex items-center gap-2`}><FileSignature className="size-6" /> {terms.title}</h1>
        <p className={ui.muted}>
          {renewal
            ? `O termo do Creator Club da ${brandName} mudou. Leia a versão nova e aceite para continuar usando o portal.`
            : `Para ativar seu portal do Creator Club da ${brandName}, leia e aceite o termo abaixo.`}
        </p>
      </div>
      <div className={`${ui.inset} max-h-[50vh] overflow-y-auto whitespace-pre-line text-sm leading-relaxed`} tabIndex={0} aria-label="Texto do termo">
        {terms.body}
      </div>
      <p className={ui.hint}>Versão {terms.version}</p>
      <form action={action} className="flex flex-col gap-4">
        <input type="hidden" name="marca" value={marca} />
        <input type="hidden" name="termsVersionId" value={terms.id} />
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={ui.label}>
            Nome completo
            <input name="fullName" defaultValue={defaultName} autoComplete="name" required className={ui.input} />
          </label>
          <label className={ui.label}>
            CPF
            <input name="cpf" inputMode="numeric" placeholder="000.000.000-00" required className={ui.input} />
          </label>
        </div>
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" name="accept" required className="mt-0.5 size-4 accent-[var(--brand)]" />
          <span>Li e aceito o termo. Sei que meu nome, CPF, a data, a hora e o IP ficam registrados como prova do aceite.</span>
        </label>
        <Msg state={state} />
        <button className={`${ui.btn} self-start`} disabled={pending}>{pending ? "Registrando…" : "Aceitar e continuar"}</button>
      </form>
    </section>
  );
}
