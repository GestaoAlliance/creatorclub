"use client";

import { useActionState } from "react";
import { SIGNUP_CONSENT_TEXT, SIGNUP_QUESTIONS, type SignupQuestion } from "@/domain";
import { ui } from "@/components/ui/styles";
import { signupAction, type SignupState } from "./actions";

function Field({ q, value, error }: { q: SignupQuestion; value: string; error?: string | undefined }) {
  const label = (
    <span className="text-sm font-medium text-stone-800 dark:text-stone-200">
      {q.label}
      {q.required && <span className="text-brand dark:text-brand-2"> *</span>}
    </span>
  );
  const err = error && <span role="alert" className="text-xs text-red-700 dark:text-red-400">{error}</span>;
  if (q.kind === "multi") {
    const chosen = value.split(", ");
    return (
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2">{label}</legend>
        <div className="flex flex-wrap gap-2">
          {q.options!.map((o) => (
            <label key={o} className="glass flex cursor-pointer items-center gap-2 rounded-2xl px-3.5 py-2 text-sm has-[:checked]:bg-brand has-[:checked]:text-white">
              <input type="checkbox" name={q.key} value={o} defaultChecked={chosen.includes(o)} className="size-4 accent-white" />
              {o}
            </label>
          ))}
        </div>
        {q.hint && <span className={ui.hint}>{q.hint}</span>}
        {err}
      </fieldset>
    );
  }
  if (q.kind === "choice") {
    return (
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2">{label}</legend>
        <div className="flex flex-wrap gap-2">
          {q.options!.map((o) => (
            <label key={o} className="glass flex cursor-pointer items-center gap-2 rounded-2xl px-3.5 py-2 text-sm has-[:checked]:bg-brand has-[:checked]:text-white">
              <input type="radio" name={q.key} value={o} defaultChecked={value === o} required={q.required} className="sr-only" />
              {o}
            </label>
          ))}
        </div>
        {err}
      </fieldset>
    );
  }
  return (
    <label className="flex flex-col gap-1.5">
      {label}
      {q.kind === "long" ? (
        <textarea name={q.key} defaultValue={value} required={q.required} rows={3} maxLength={1500} className={`${ui.input} rounded-2xl`} />
      ) : (
        <input
          name={q.key}
          type={q.kind === "email" ? "email" : q.kind === "tel" ? "tel" : "text"}
          defaultValue={value}
          required={q.required}
          maxLength={300}
          autoComplete={q.key === "fullName" ? "name" : q.kind === "email" ? "email" : q.kind === "tel" ? "tel" : "off"}
          className={ui.input}
        />
      )}
      {q.hint && <span className={ui.hint}>{q.hint}</span>}
      {err}
    </label>
  );
}

/** Formulário de inscrição (D-SIGNUP): as mesmas perguntas do Google, no visual do sistema. */
export function SignupForm({ hunterCode }: { hunterCode: string | null }) {
  const [state, action, pending] = useActionState(signupAction, { n: 0 } as SignupState);
  if (state.done) {
    return (
      <div className="flex flex-col gap-2 py-6 text-center">
        <p className="text-lg font-semibold">Inscrição recebida!</p>
        <p className={ui.muted}>Obrigada pelo interesse! A equipe vai analisar e falar com você pelo WhatsApp.</p>
      </div>
    );
  }
  const v = state.values ?? {};
  return (
    <form key={state.n} action={action} className="flex flex-col gap-6" noValidate={false}>
      {hunterCode && <input type="hidden" name="h" value={hunterCode} />}
      {/* Campo que só robô preenche (fica fora da tela). */}
      <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>Site<input name="site" tabIndex={-1} autoComplete="off" /></label>
      </div>
      {SIGNUP_QUESTIONS.map((q) => (
        <Field key={q.key} q={q} value={v[q.key] ?? ""} error={state.errors?.[q.key]} />
      ))}
      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" name="consent" value="sim" required defaultChecked={v.consent === "sim"} className="mt-0.5 size-4 accent-[var(--brand)]" />
        <span>{SIGNUP_CONSENT_TEXT}</span>
      </label>
      {state.errors?.consent && <p role="alert" className={ui.error}>{state.errors.consent}</p>}
      {state.errors?._form && <p role="alert" className={ui.error}>{state.errors._form}</p>}
      {state.errors && !state.errors._form && <p role="alert" className={ui.error}>Confira os campos marcados acima.</p>}
      <button className={`${ui.btn} self-stretch sm:self-start`} disabled={pending}>{pending ? "Enviando…" : "Enviar inscrição"}</button>
    </form>
  );
}
