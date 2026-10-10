"use client";

import { useActionState } from "react";
import { requestPasswordReset, signIn, updatePassword } from "./actions";
import { Msg as Message } from "@/components/ui/msg";
import { ui } from "@/components/ui/styles";
import { PASSWORD_MIN_LENGTH } from "@/lib/auth/rules";

const input = ui.input;
const button = `${ui.btn} w-full`;
const field = ui.label;

export function SignInForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(signIn, undefined);
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="next" value={next} />
      <label className={field}>E-mail
        <input className={input} name="email" type="email" autoComplete="email" required />
      </label>
      <label className={field}>Senha
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
    <form action={action} className="flex flex-col gap-4">
      <label className={field}>E-mail
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
    <form action={action} className="flex flex-col gap-4">
      <label className={field}>Nova senha (mínimo {PASSWORD_MIN_LENGTH} caracteres)
        <input className={input} name="password" type="password" autoComplete="new-password"
          minLength={PASSWORD_MIN_LENGTH} required />
      </label>
      <label className={field}>Repita a nova senha
        <input className={input} name="confirm" type="password" autoComplete="new-password"
          minLength={PASSWORD_MIN_LENGTH} required />
      </label>
      <Message state={state} />
      <button className={button} disabled={pending}>{pending ? "Salvando..." : "Salvar nova senha"}</button>
    </form>
  );
}
