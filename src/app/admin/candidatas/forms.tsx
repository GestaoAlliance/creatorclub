"use client";

import { MessageCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useCallback, useEffect, useState } from "react";
import { Msg } from "@/components/ui/msg";
import { ui } from "@/components/ui/styles";
import { rejectionMessage, welcomeMessage, whatsappLink } from "@/domain";
import { approveAction, rejectAction } from "./actions";

const CATEGORY = { INFLUENCER: "Influencer", PRESCRITOR: "Prescritor", UGC: "UGC" } as const;

type Person = { applicationId: string; name: string; phone: string | null; brand: string };

/** Abre o WhatsApp da pessoa com a mensagem pronta; sem número reconhecido, copia a mensagem. */
function WhatsAppButton({ phone, text, label }: { phone: string | null; text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const href = whatsappLink(phone, text);
  if (href)
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={`${ui.btnSm} inline-flex items-center gap-1.5 self-start`}>
        <MessageCircle className="size-4" /> {label}
      </a>
    );
  return (
    <div className="flex flex-col gap-1">
      <p className={ui.hint}>WhatsApp não reconhecido ({phone || "sem número"}). Copie a mensagem e mande por onde der.</p>
      <button type="button" className={`${ui.ghostSm} self-start`} onClick={() => { void navigator.clipboard.writeText(text); setCopied(true); }}>
        {copied ? "Mensagem copiada" : "Copiar mensagem"}
      </button>
    </div>
  );
}

function Done({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-emerald-400/50 bg-emerald-100/70 p-4 text-sm text-emerald-950 dark:bg-emerald-900/30 dark:text-emerald-100">
      {children}
      <button type="button" className={`${ui.ghostSm} self-start`} onClick={() => router.refresh()}>Concluir</button>
    </div>
  );
}

/**
 * Aprovar com um clique (F3): cria o cupom na Shopify, a creator e o convite do portal (por e-mail quando houver
 * remetente) e oferece o WhatsApp de boas-vindas pronto.
 */
function ApproveForm(p: Person & { email: string | null; coupon: string; category: keyof typeof CATEGORY; onDone: () => void }) {
  const [state, action, pending] = useActionState(approveAction, undefined);
  const { onDone } = p;
  useEffect(() => { if (state?.ok) onDone(); }, [state, onDone]);
  const [copied, setCopied] = useState(false);
  if (state?.ok) {
    const o = state.ok;
    const pct = (o.discountBps / 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
    return (
      <Done>
        <p><strong>{p.name}</strong> agora é creator. Cupom <strong className="font-mono">{o.coupon}</strong> criado na Shopify ({pct}% de desconto, combinável com outros descontos).</p>
        {o.link ? (
          <>
            {o.mail && <p>Convite enviado por e-mail para {o.mail}.</p>}
            {o.mailError && <p>O e-mail do convite não foi enviado ({o.mailError}). Mande pelo WhatsApp.</p>}
            <WhatsAppButton phone={p.phone} label="Abrir WhatsApp com as boas-vindas" text={welcomeMessage({ name: p.name, brand: p.brand, coupon: o.coupon, discountBps: o.discountBps, inviteLink: o.link })} />
            <p className={ui.hint}>Link do convite (aparece só agora; vale 7 dias, uma vez):</p>
            <code className="break-all font-mono text-xs">{o.link}</code>
            <button type="button" className={`${ui.ghostSm} self-start`} onClick={() => { void navigator.clipboard.writeText(o.link!); setCopied(true); }}>
              {copied ? "Copiado" : "Copiar convite"}
            </button>
          </>
        ) : (
          <>
            <p>Convite não gerado: {o.inviteError}</p>
            <WhatsAppButton phone={p.phone} label="Abrir WhatsApp com as boas-vindas" text={welcomeMessage({ name: p.name, brand: p.brand, coupon: o.coupon, discountBps: o.discountBps, inviteLink: null })} />
          </>
        )}
        <Link href={`/admin/creators/${o.creatorId}`} className={`${ui.link} self-start`}>Abrir a ficha</Link>
      </Done>
    );
  }
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="applicationId" value={p.applicationId} />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <label className={ui.label}>
          Cupom
          <input name="coupon" defaultValue={p.coupon} required maxLength={8} className={`${ui.inputSm} font-mono uppercase`} />
        </label>
        <label className={ui.label}>
          Tipo
          <select name="category" defaultValue={p.category} className={ui.inputSm}>
            {Object.entries(CATEGORY).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <label className={ui.label}>
          Comissão %
          <input name="rate" defaultValue="15" inputMode="decimal" required className={ui.inputSm} />
        </label>
        <label className={ui.label}>
          Desconto %
          <input name="discount" defaultValue="5" inputMode="decimal" required className={ui.inputSm} />
        </label>
        <label className={`${ui.label} col-span-full`}>
          E-mail do convite
          <input name="email" type="email" defaultValue={p.email ?? ""} required className={ui.inputSm} />
        </label>
      </div>
      <Msg state={state?.error ? { error: state.error } : undefined} />
      <button className={`${ui.btn} self-start`} disabled={pending}>{pending ? "Criando cupom e convite…" : "Aprovar: criar cupom na Shopify e convite"}</button>
    </form>
  );
}

function RejectForm(p: Person & { onDone: () => void }) {
  const [state, action, pending] = useActionState(rejectAction, undefined);
  const { onDone } = p;
  useEffect(() => { if (state?.ok) onDone(); }, [state, onDone]);
  if (state?.ok)
    return (
      <Done>
        <p>{p.name}: candidata recusada.</p>
        <WhatsAppButton phone={p.phone} label="Abrir WhatsApp com a resposta" text={rejectionMessage({ name: p.name, brand: p.brand })} />
      </Done>
    );
  return (
    <details>
      <summary className="cursor-pointer text-xs text-stone-500 hover:underline">Recusar</summary>
      <form action={action} className="mt-2 flex flex-col gap-1.5">
        <input type="hidden" name="applicationId" value={p.applicationId} />
        <div className="flex gap-2">
          <input name="note" maxLength={300} placeholder="Motivo (opcional, só a equipe vê)" className={`${ui.inputSm} min-w-0 flex-1`} />
          <button className={ui.dangerSm} disabled={pending}>Recusar</button>
        </div>
        <Msg state={state} />
      </form>
    </details>
  );
}

/** Aprovar e recusar juntos: decidido um, o outro some (a linha só sai da lista no "Concluir"). */
export function DecisionForms(p: Person & { email: string | null; coupon: string; category: keyof typeof CATEGORY }) {
  const [done, setDone] = useState<"approved" | "rejected" | null>(null);
  const approved = useCallback(() => setDone("approved"), []);
  const rejected = useCallback(() => setDone("rejected"), []);
  return (
    <>
      {done !== "rejected" && <ApproveForm {...p} onDone={approved} />}
      {done !== "approved" && <RejectForm applicationId={p.applicationId} name={p.name} phone={p.phone} brand={p.brand} onDone={rejected} />}
    </>
  );
}
