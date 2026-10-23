"use client";

import { KeyRound, Mail, MessageCircle } from "lucide-react";
import { useActionState } from "react";
import { resetPasswordAction } from "@/app/admin/acesso/actions";
import { CopyButton } from "@/components/portal/copy-button";
import { Msg } from "@/components/ui/msg";
import { ui } from "@/components/ui/styles";
import { whatsappLink } from "@/domain";

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : null;

/** M4.4b (D-ACCESS): último acesso e nova senha (link para o WhatsApp ou e-mail). */
export function AccessBox({ userId, lastSeenAt, canReset, name, phone = null }: { userId: string; lastSeenAt: string | null; canReset: boolean; name: string; phone?: string | null }) {
  const [state, action, pending] = useActionState(resetPasswordAction, undefined);
  const seen = when(lastSeenAt);
  const first = name.trim().split(/\s+/)[0] ?? name;
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm">
        <span className="text-stone-500">Último acesso:</span> {seen ?? "ainda não entrou desde que começamos a registrar"}
      </p>
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
