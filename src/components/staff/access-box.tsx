"use client";

import { KeyRound, Mail, MessageCircle } from "lucide-react";
import { useActionState } from "react";
import { loginEmailAction, resetPasswordAction, temporaryPasswordAction } from "@/app/admin/acesso/actions";
import { CopyButton } from "@/components/portal/copy-button";
import { Msg } from "@/components/ui/msg";
import { ui } from "@/components/ui/styles";
import { whatsappLink } from "@/domain";

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : null;

/** M4.4b (D-ACCESS): último acesso e nova senha (link para o WhatsApp ou e-mail). */
export function AccessBox({ userId, lastSeenAt, canReset, name, phone = null, loginEmail = null }: { userId: string; lastSeenAt: string | null; canReset: boolean; name: string; phone?: string | null; loginEmail?: string | null }) {
  const [state, action, pending] = useActionState(resetPasswordAction, undefined);
  const [temp, tempAction, tempPending] = useActionState(temporaryPasswordAction, undefined);
  const [mail, mailAction, mailPending] = useActionState(loginEmailAction, undefined);
  const seen = when(lastSeenAt);
  const first = name.trim().split(/\s+/)[0] ?? name;
  const login = mail?.email ?? loginEmail;
  const tempText = temp?.password ? `Oi, ${first}! Para entrar no portal:\nE-mail: ${temp.email}\nSenha provisória: ${temp.password}\nNo primeiro acesso o portal pede para você criar a sua própria senha.` : "";
  return (
    <div className="flex flex-col gap-2">
      {/* D-ACCESSFIX: o e-mail exato com que ela entra (erro de digitação aparece aqui). */}
      {login && (
        <p className="text-sm">
          <span className="text-stone-500">Entra com:</span> <span className="font-mono">{login}</span>
        </p>
      )}
      <p className="text-sm">
        <span className="text-stone-500">Último acesso:</span> {seen ?? "ainda não entrou desde que começamos a registrar"}
      </p>
      {canReset && (
        <form action={tempAction} onSubmit={(e) => { if (!confirm("Criar uma senha provisória? A senha atual dela deixa de valer.")) e.preventDefault(); }} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="userId" value={userId} />
          <button className={`${ui.btnSm} inline-flex items-center gap-1.5`} disabled={tempPending}><KeyRound className="size-3.5" /> {tempPending ? "Criando…" : "Criar senha provisória"}</button>
          <span className={ui.hint}>A mais simples: ela entra com a senha que você mandar e cria a dela no primeiro acesso.</span>
        </form>
      )}
      <Msg state={temp?.password ? undefined : temp} />
      {temp?.password && (
        <div className={`${ui.inset} flex flex-col gap-2 text-sm`}>
          <p>{temp.ok}</p>
          <p>E-mail: <span className="font-mono">{temp.email}</span> · Senha: <span className="font-mono text-base font-semibold">{temp.password}</span></p>
          <div className="flex flex-wrap gap-2">
            <CopyButton value={tempText} label="Copiar mensagem" />
            {whatsappLink(phone, tempText) && (
              <a href={whatsappLink(phone, tempText)!} target="_blank" rel="noopener noreferrer" className={`${ui.btnSm} inline-flex items-center gap-1.5`}>
                <MessageCircle className="size-3.5" /> Abrir WhatsApp
              </a>
            )}
          </div>
        </div>
      )}
      {canReset && loginEmail && (
        <details className="text-sm">
          <summary className="cursor-pointer text-stone-500 hover:underline">Corrigir e-mail de login</summary>
          <form action={mailAction} className="mt-2 flex flex-wrap items-center gap-2">
            <input type="hidden" name="userId" value={userId} />
            <input name="email" type="email" required defaultValue={login ?? ""} className={`${ui.inputSm} min-w-0 flex-1`} aria-label="E-mail de login correto" />
            <button className={ui.ghostSm} disabled={mailPending}>{mailPending ? "Salvando…" : "Salvar e-mail"}</button>
          </form>
          <p className={ui.hint}>Troca o e-mail de login e o do cadastro. A senha continua a mesma.</p>
          <Msg state={mail} />
        </details>
      )}
      {canReset && (
        <form action={action} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="userId" value={userId} />
          <button name="how" value="link" className={`${ui.ghostSm} inline-flex items-center gap-1.5`} disabled={pending}><KeyRound className="size-3.5" /> Gerar link de nova senha</button>
          <button name="how" value="email" className={`${ui.ghostSm} inline-flex items-center gap-1.5`} disabled={pending}><Mail className="size-3.5" /> Mandar por e-mail</button>
        </form>
      )}
      <Msg state={state?.link ? undefined : state} />
      {state?.link && (
        <div className={`${ui.inset} flex flex-col gap-2 text-sm`}>
          <p>{state.ok}</p>
          <p className="break-all font-mono text-xs">{state.link}</p>
          <div className="flex flex-wrap gap-2">
            <CopyButton value={state.link} label="Copiar link" />
            {whatsappLink(phone, `Oi, ${first}! Segue o link para criar uma nova senha do portal (vale por 1 hora e só funciona uma vez):\n${state.link}`) && (
              <a href={whatsappLink(phone, `Oi, ${first}! Segue o link para criar uma nova senha do portal (vale por 1 hora e só funciona uma vez):\n${state.link}`)!} target="_blank" rel="noopener noreferrer" className={`${ui.btnSm} inline-flex items-center gap-1.5`}>
                <MessageCircle className="size-3.5" /> Abrir WhatsApp
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
