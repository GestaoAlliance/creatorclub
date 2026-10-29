"use client";

import { MessageCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useCallback, useEffect, useState } from "react";
import { Msg } from "@/components/ui/msg";
import { ui } from "@/components/ui/styles";
import { approvalMessage, rejectionMessage, whatsappLink } from "@/domain";
import { approveAction, rejectAction } from "./actions";

const CATEGORY = { INFLUENCER: "Influencer", PRESCRITOR: "Prescritor", UGC: "UGC" } as const;

type Person = { applicationId: string; name: string; phone: string | null; brand: string };
export type TemplateOption = { id: string; name: string; documentKind: string; key: string };
/** D-AUTENTIQUE2: valores do contrato assinado no Autentique (a aprovação usa estes, sem editar). */
export type SignedContract = { coupon: string; category: string; ratePct: number; discountPct: number; templateName: string };

/** Versão de contrato sugerida pelo tipo: a mais nova (pela chave) do mesmo tipo de texto. */
const defaultTemplate = (templates: readonly TemplateOption[], category: string) =>
  [...templates].filter((t) => t.documentKind === category).sort((a, b) => b.key.localeCompare(a.key))[0]?.id ?? templates[0]?.id ?? "";

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
 * Aprovar com um clique (F3): aprovar já é o contrato assinado no D4Sign (D-D4SIGN); cria o cupom na Shopify, a creator com o
 * contrato valendo e 1 produto de boas-vindas, o convite do portal (quando ela não tem senha) e a mensagem de aprovação.
 */
function ApproveForm(p: Person & { hasLogin: boolean; email: string | null; coupon: string; category: keyof typeof CATEGORY; templates: readonly TemplateOption[]; ratePct: number; discountPct: number; hasCnpj: boolean; signed: SignedContract | null; onDone: () => void }) {
  const [state, action, pending] = useActionState(approveAction, undefined);
  const { onDone } = p;
  useEffect(() => { if (state?.ok) onDone(); }, [state, onDone]);
  const [copied, setCopied] = useState(false);
  const locked = p.signed;
  const [category, setCategory] = useState<string>(locked?.category ?? p.category);
  const [template, setTemplate] = useState(() => defaultTemplate(p.templates, p.category));
  const [welcome, setWelcome] = useState<"one" | "videos">("one");
  if (state?.ok) {
    const o = state.ok;
    const pct = (o.discountBps / 100).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
    const msg = (extra: { loginUrl?: string; ordersUrl?: string | null; inviteLink?: string | null }) =>
      approvalMessage({ brand: p.brand, coupon: o.coupon, discountBps: o.discountBps, suggestion: o.suggestion, withVideos: welcome === "videos", ...extra });
    return (
      <Done>
        <p><strong>{p.name}</strong> agora é creator. Cupom <strong className="font-mono">{o.coupon}</strong> criado na Shopify ({pct}% de desconto, combinável com outros descontos). {locked ? "Contrato assinado no Autentique ligado à ficha" : "Contrato marcado como assinado"} e {welcome === "videos" ? "2 produtos liberados na aba Pedidos (combinado: 3 vídeos para a marca)" : "1 produto liberado na aba Pedidos"}.</p>
        {o.loginUrl ? (
          <>
            <p>Ela já criou a senha no cadastro: entra no portal com o e-mail dela, sem convite.</p>
            <WhatsAppButton phone={p.phone} label="Abrir WhatsApp com a aprovação" text={msg({ loginUrl: o.loginUrl, ordersUrl: o.ordersUrl ?? null })} />
          </>
        ) : o.link ? (
          <>
            {o.mail && <p>Convite enviado por e-mail para {o.mail}.</p>}
            {o.mailError && <p>O e-mail do convite não foi enviado ({o.mailError}). Mande pelo WhatsApp.</p>}
            <WhatsAppButton phone={p.phone} label="Abrir WhatsApp com a aprovação" text={msg({ inviteLink: o.link })} />
            <p className={ui.hint}>Link do convite (aparece só agora; vale 7 dias, uma vez):</p>
            <code className="break-all font-mono text-xs">{o.link}</code>
            <button type="button" className={`${ui.ghostSm} self-start`} onClick={() => { void navigator.clipboard.writeText(o.link!); setCopied(true); }}>
              {copied ? "Copiado" : "Copiar convite"}
            </button>
          </>
        ) : (
          <>
            <p>Convite não gerado: {o.inviteError}</p>
            <WhatsAppButton phone={p.phone} label="Abrir WhatsApp com a aprovação" text={msg({})} />
          </>
        )}
        <Link href={`/admin/creators/${o.creatorId}`} className={`${ui.link} self-start`}>Abrir a ficha</Link>
      </Done>
    );
  }
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="applicationId" value={p.applicationId} />
      {locked && <p className={ui.hint}>Valores do contrato que ela assinou ({locked.templateName}).</p>}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <label className={ui.label}>
          Cupom
          <input name="coupon" defaultValue={locked?.coupon ?? p.coupon} readOnly={!!locked} required maxLength={20} className={`${ui.inputSm} font-mono uppercase`} />
        </label>
        <label className={ui.label}>
          Tipo
          <select
            name="category"
            value={category}
            disabled={!!locked}
            onChange={(e) => { setCategory(e.target.value); setTemplate(defaultTemplate(p.templates, e.target.value)); }}
            className={ui.inputSm}
          >
            {Object.entries(CATEGORY).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          {locked && <input type="hidden" name="category" value={category} />}
        </label>
        <label className={ui.label}>
          Comissão %
          <input name="rate" defaultValue={String(locked?.ratePct ?? p.ratePct).replace(".", ",")} readOnly={!!locked} inputMode="decimal" required className={ui.inputSm} />
        </label>
        <label className={ui.label}>
          Desconto %
          <input name="discount" defaultValue={String(locked?.discountPct ?? p.discountPct).replace(".", ",")} readOnly={!!locked} inputMode="decimal" required className={ui.inputSm} />
        </label>
        {!locked && p.templates.length > 0 && (
          <label className={`${ui.label} col-span-full sm:col-span-2`}>
            Contrato que ela assinou
            <select name="contractTemplateId" value={template} onChange={(e) => setTemplate(e.target.value)} className={ui.inputSm}>
              {p.templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>
        )}
        {category !== "UGC" && (
          <label className={`${ui.label} col-span-full sm:col-span-2`}>
            Tipo de recebimento
            <select name="payout" defaultValue={p.hasCnpj ? "cnpj" : "cpf"} className={ui.inputSm}>
              <option value="cnpj">Creator CNPJ (saque com nota fiscal)</option>
              <option value="cpf">Creator CPF (saque com recibo)</option>
            </select>
          </label>
        )}
        {/* D-WELCOMEVIDEO: Opção 2 das regras da Botanika. */}
        <label className={`${ui.label} col-span-full sm:col-span-2`}>
          Envio inicial
          <select name="welcome" value={welcome} onChange={(e) => setWelcome(e.target.value as "one" | "videos")} className={ui.inputSm}>
            <option value="one">1 produto</option>
            <option value="videos">2 produtos + 3 vídeos para a marca</option>
          </select>
        </label>
        <label className={`${ui.label} col-span-full ${!locked && p.templates.length > 0 ? "sm:col-span-2" : ""}`}>
          {p.hasLogin ? "E-mail (do login dela)" : "E-mail do convite"}
          <input name="email" type="email" defaultValue={p.email ?? ""} required readOnly={p.hasLogin} className={ui.inputSm} />
        </label>
      </div>
      <Msg state={state?.error ? { error: state.error } : undefined} />
      <button className={`${ui.btn} self-start`} disabled={pending}>{pending ? "Aprovando…" : p.hasLogin ? "Aprovar: criar cupom na Shopify" : "Aprovar: criar cupom na Shopify e convite"}</button>
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
        <p>{p.name}: candidata recusada.{state.ok.includes("cancelado") ? " O contrato que ela ainda não tinha assinado foi cancelado no Autentique." : ""}</p>
        {/* D-AUTENTIQUE2 (2026-10-29): a recusa vai com a mensagem curta, pelo botão (a equipe revisa e envia). */}
        <WhatsAppButton phone={p.phone} label="Abrir WhatsApp com a recusa" text={rejectionMessage({ name: p.name, brand: p.brand })} />
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
export function DecisionForms(p: Person & { hasLogin: boolean; email: string | null; coupon: string; category: keyof typeof CATEGORY; templates: readonly TemplateOption[]; ratePct: number; discountPct: number; hasCnpj: boolean; autentique: boolean; signed: SignedContract | null }) {
  const [done, setDone] = useState<"approved" | "rejected" | null>(null);
  const approved = useCallback(() => setDone("approved"), []);
  const rejected = useCallback(() => setDone("rejected"), []);
  return (
    <>
      {done !== "rejected" &&
        (p.autentique && !p.signed ? (
          <p className={ui.hint}>Aprovar libera depois que ela assinar o contrato no Autentique (o sistema confere a cada 5 minutos).</p>
        ) : (
          <ApproveForm {...p} onDone={approved} />
        ))}
      {done !== "approved" && <RejectForm applicationId={p.applicationId} name={p.name} phone={p.phone} brand={p.brand} onDone={rejected} />}
    </>
  );
}
