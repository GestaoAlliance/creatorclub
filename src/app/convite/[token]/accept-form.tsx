"use client";

import { useActionState } from "react";
import { PASSWORD_MIN_LENGTH } from "@/lib/auth/rules";
import { ui } from "@/components/ui/styles";
import { acceptInviteAction } from "./actions";

const input = ui.input;

/** D-SAVEPASSWORD: com e-mail conhecido, ele vai junto (só leitura) para o navegador salvar a senha nova no login certo. */
export function AcceptForm({ token, needsPassword, askEmail = false, email = null }: { token: string; needsPassword: boolean; askEmail?: boolean; email?: string | null }) {
  const [state, action, pending] = useActionState(acceptInviteAction, undefined);
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />
      {askEmail && (
        <label className={ui.label}>Seu e-mail (é com ele que você vai entrar)
          <input className={input} name="email" type="email" autoComplete="username" autoCapitalize="none" spellCheck={false} required />
        </label>
      )}
      {needsPassword && !askEmail && email && <input className="sr-only" tabIndex={-1} aria-hidden name="username" type="email" autoComplete="username" value={email} readOnly />}
      {needsPassword && (
        <>
          <label className={ui.label}>Crie sua senha (mínimo {PASSWORD_MIN_LENGTH} caracteres)
            <input className={input} name="password" type="password" autoComplete="new-password" minLength={PASSWORD_MIN_LENGTH} required />
          </label>
          <label className={ui.label}>Repita a senha
            <input className={input} name="confirm" type="password" autoComplete="new-password" minLength={PASSWORD_MIN_LENGTH} required />
          </label>
        </>
      )}
      {state?.error && <p role="alert" className={ui.error}>{state.error}</p>}
      <button className={`${ui.btn} w-full`} disabled={pending}>
        {pending ? "Aceitando..." : "Aceitar convite"}
      </button>
    </form>
  );
}
