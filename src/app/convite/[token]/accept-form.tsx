"use client";

import { useActionState } from "react";
import { PASSWORD_MIN_LENGTH } from "@/lib/auth/rules";
import { ui } from "@/components/ui/styles";
import { acceptInviteAction } from "./actions";

const input = ui.input;

export function AcceptForm({ token, needsPassword }: { token: string; needsPassword: boolean }) {
  const [state, action, pending] = useActionState(acceptInviteAction, undefined);
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />
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
