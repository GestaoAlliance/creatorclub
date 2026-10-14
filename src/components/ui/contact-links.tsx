import { AtSign, MessageCircle } from "lucide-react";
import { instagramUrl, linkifyText, whatsappChatUrl } from "@/domain";
import { ui } from "./styles";

const ext = { target: "_blank", rel: "noopener noreferrer" } as const;

/** @ do Instagram clicável (abre o perfil); se não der para montar o link, mostra o texto. */
export function InstagramLink({ handle }: { handle: string }) {
  const url = instagramUrl(handle);
  const label = `@${handle.replace(/^@+/, "")}`;
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <AtSign className="size-3.5 shrink-0 text-stone-500" />
      {url ? <a href={url} {...ext} className={`${ui.link} truncate`}>{label.slice(1)}</a> : <span className="truncate">{label.slice(1)}</span>}
    </span>
  );
}

/** Telefone com atalho para conversar no WhatsApp. */
export function WhatsappLink({ phone }: { phone: string }) {
  const url = whatsappChatUrl(phone);
  return (
    <span className="flex items-center gap-1.5">
      <MessageCircle className="size-3.5 shrink-0 text-stone-500" />
      {url ? <a href={url} {...ext} className={ui.link} title="Abrir conversa no WhatsApp">{phone}</a> : phone}
    </span>
  );
}

/** Texto livre com os links clicáveis (respostas do formulário). */
export function LinkifiedText({ text }: { text: string }) {
  return (
    <>
      {linkifyText(text).map((p, i) =>
        p.href ? <a key={i} href={p.href} {...ext} className={`${ui.link} break-all`}>{p.text}</a> : <span key={i}>{p.text}</span>,
      )}
    </>
  );
}
