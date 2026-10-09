"use client";

import { useActionState } from "react";
import { PASSWORD_MIN_LENGTH } from "@/lib/auth/rules";
import { acceptInviteAction } from "./actions";

const input = "w-full rounded border border-stone-300 px-3 py-2";

export function AcceptForm({ token, needsPassword }: { token: string; needsPassword: boolean }) {
  const [state, action, pending] = useActionState(acceptInviteAction, undefined);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="token" value={token} />
      {needsPassword && (
        <>
          <label className="flex flex-col gap-1 text-sm">Crie sua senha (mínimo {PASSWORD_MIN_LENGTH} caracteres)
            <input className={input} name="password" type="password" autoComplete="new-password" minLength={PASSWORD_MIN_LENGTH} required />
          </label>
          <label className="flex flex-col gap-1 text-sm">Repita a senha
            <input className={input} name="confirm" type="password" autoComplete="new-password" minLength={PASSWORD_MIN_LENGTH} required />
          </label>
        </>
      )}
      {state?.error && <p role="alert" className="text-sm text-red-700">{state.error}</p>}
      <button className="rounded bg-brand px-3 py-2 font-semibold text-white disabled:opacity-60" disabled={pending}>
        {pending ? "Aceitando..." : "Aceitar convite"}
      </button>
    </form>
  );
}
