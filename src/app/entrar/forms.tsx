"use client";

import { useActionState, useState } from "react";
import { requestPasswordReset, updatePassword } from "./actions";
import { Msg as Message } from "@/components/ui/msg";
import { ui } from "@/components/ui/styles";
import { PASSWORD_MIN_LENGTH } from "@/lib/auth/rules";

const input = ui.input;
const button = `${ui.btn} w-full`;
const field = ui.label;

/**
 * D-SAVEPASSWORD: formulário comum (POST para /entrar/login, a página recarrega) com os campos marcados como usuário e
 * senha atual: o navegador oferece "Salvar senha" e preenche sozinho da próxima vez.
 */
export function SignInForm({ next, email = "", error = null }: { next: string; email?: string; error?: string | null }) {
  const [pending, setPending] = useState(false);
  return (
    <form method="post" action="/entrar/login" onSubmit={() => setPending(true)} className="flex flex-col gap-4">
      <input type="hidden" name="next" value={next} />
      <label className={field} htmlFor="login-email">E-mail
        <input className={input} id="login-email" name="email" type="email" inputMode="email" autoComplete="username" autoCapitalize="none" spellCheck={false} defaultValue={email} required />
      </label>
      <label className={field} htmlFor="login-senha">Senha
        <input className={input} id="login-senha" name="password" type="password" autoComplete="current-password" required />
      </label>
      {error && <p role="alert" className={ui.error}>{error}</p>}
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

/** D-SAVEPASSWORD: o e-mail vai junto (campo de usuário só de leitura) para o navegador salvar a senha nova no login certo. */
export function NewPasswordForm({ email = null }: { email?: string | null }) {
  const [state, action, pending] = useActionState(updatePassword, undefined);
  return (
    <form action={action} className="flex flex-col gap-4">
      {email && (
        <label className={field}>E-mail
          <input className={`${input} opacity-70`} name="username" type="email" autoComplete="username" value={email} readOnly />
        </label>
      )}
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
