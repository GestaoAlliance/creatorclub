"use client";

import { useActionState } from "react";
import { requestPasswordReset, signIn, updatePassword, type FormState } from "./actions";
import { PASSWORD_MIN_LENGTH } from "@/lib/auth/rules";

const input = "w-full rounded border border-stone-300 px-3 py-2";
const button = "w-full rounded bg-brand px-3 py-2 font-semibold text-white disabled:opacity-60";

function Message({ state }: { state: FormState }) {
  if (state?.error) return <p role="alert" className="text-sm text-red-700">{state.error}</p>;
  if (state?.ok) return <p role="status" className="text-sm text-green-800">{state.ok}</p>;
  return null;
}

export function SignInForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(signIn, undefined);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="next" value={next} />
      <label className="flex flex-col gap-1 text-sm">E-mail
        <input className={input} name="email" type="email" autoComplete="email" required />
      </label>
      <label className="flex flex-col gap-1 text-sm">Senha
        <input className={input} name="password" type="password" autoComplete="current-password" required />
      </label>
      <Message state={state} />
      <button className={button} disabled={pending}>{pending ? "Entrando..." : "Entrar"}</button>
    </form>
  );
}

export function ResetRequestForm() {
  const [state, action, pending] = useActionState(requestPasswordReset, undefined);
  return (
    <form action={action} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm">E-mail
        <input className={input} name="email" type="email" autoComplete="email" required />
      </label>
      <Message state={state} />
      <button className={button} disabled={pending}>{pending ? "Enviando..." : "Enviar link"}</button>
    </form>
  );
}

export function NewPasswordForm() {
  const [state, action, pending] = useActionState(updatePassword, undefined);
  return (
    <form action={action} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm">Nova senha (mínimo {PASSWORD_MIN_LENGTH} caracteres)
        <input className={input} name="password" type="password" autoComplete="new-password"
          minLength={PASSWORD_MIN_LENGTH} required />
      </label>
      <label className="flex flex-col gap-1 text-sm">Repita a nova senha
        <input className={input} name="confirm" type="password" autoComplete="new-password"
          minLength={PASSWORD_MIN_LENGTH} required />
      </label>
      <Message state={state} />
      <button className={button} disabled={pending}>{pending ? "Salvando..." : "Salvar nova senha"}</button>
    </form>
  );
}
