"use client";

import { FileSignature, RefreshCw } from "lucide-react";
import { useActionState, useState } from "react";
import { Msg } from "@/components/ui/msg";
import { badge, ui } from "@/components/ui/styles";
import { contractBadge } from "@/domain";
import { checkContractAction, sendContractAction } from "./actions";

const CATEGORY = { INFLUENCER: "Influencer", PRESCRITOR: "Prescritor", UGC: "UGC" } as const;
const when = (d: Date) => d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const pct = (bps: number) => (bps / 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 });

export type ContractInfo = {
  status: "SENT" | "SIGNED" | "REJECTED" | "CANCELLED";
  sandbox: boolean;
  sentAt: Date;
  signedAt: Date | null;
  rejectedAt: Date | null;
  rejectReason: string | null;
  signLink: string | null;
  linkSentAt: Date | null;
  lastCheckedAt: Date | null;
  lastError: string | null;
  coupon: string | null;
  discountBps: number | null;
  rateBps: number | null;
  templateName: string;
  category: string;
};

/**
 * Contrato da candidata pelo Autentique (D-AUTENTIQUE2): situação, link de assinatura, conferir agora e
 * enviar/reenviar com cupom, tipo, comissão e desconto (reenviar cancela o contrato ainda não assinado).
 */
export function ContractBox(p: {
  applicationId: string;
  contract: ContractInfo | null;
  error: string | null;
  canDecide: boolean;
  coupon: string;
  category: keyof typeof CATEGORY;
  ratePct: number;
  discountPct: number;
}) {
  const c = p.contract;
  const b = contractBadge(c, p.error);
  const [check, checkAction, checking] = useActionState(checkContractAction, undefined);
  const [send, sendAction, sending] = useActionState(sendContractAction, undefined);
  const [editing, setEditing] = useState(false);
  const canSend = p.canDecide && c?.status !== "SIGNED";
  return (
    <section className={`${ui.inset} flex flex-col gap-2 text-sm`}>
      <p className="flex flex-wrap items-center gap-2">
        <FileSignature className="size-4 text-stone-500" />
        <span className="font-medium">Contrato (Autentique)</span>
        <span className={badge[b.tone]}>{b.label}</span>
        {c?.sandbox && <span className={badge.neutral}>modo teste</span>}
      </p>
      {!c && p.error && <p className="text-red-800 dark:text-red-300">Não saiu sozinho: {p.error}</p>}
      {!c && !p.error && <p className={ui.hint}>Candidatas do site recebem o contrato sozinhas; as dos formulários antigos, pelo botão abaixo.</p>}
      {c && (
        <>
          <p className={ui.hint}>
            {c.templateName} · cupom <span className="font-mono">{c.coupon}</span> · comissão {c.rateBps !== null ? `${pct(c.rateBps)}%` : "—"} · desconto {c.discountBps !== null ? `${pct(c.discountBps)}%` : "—"}
          </p>
          <p className={ui.hint}>
            Enviado em {when(c.sentAt)}
            {c.linkSentAt ? ` · link no WhatsApp em ${when(c.linkSentAt)}` : c.status === "SENT" && c.signLink ? " · link no WhatsApp: na fila (9h às 20h)" : ""}
            {c.signedAt && ` · assinado em ${when(c.signedAt)}`}
            {c.rejectedAt && ` · recusado em ${when(c.rejectedAt)}${c.rejectReason ? ` (“${c.rejectReason}”)` : ""}`}
            {c.status === "SENT" && c.lastCheckedAt && ` · conferido em ${when(c.lastCheckedAt)}`}
          </p>
          {c.lastError && <p className="text-xs text-amber-800 dark:text-amber-300">Último aviso do Autentique: {c.lastError}</p>}
          {c.status === "SENT" && c.signLink && (
            <p className="text-xs">
              Link de assinatura: <a href={c.signLink} target="_blank" rel="noopener noreferrer" className={ui.link}>{c.signLink}</a>
            </p>
          )}
        </>
      )}
      {p.canDecide && (
        <div className="flex flex-wrap items-center gap-2">
          {c?.status === "SENT" && (
            <form action={checkAction}>
              <input type="hidden" name="applicationId" value={p.applicationId} />
              <button className={`${ui.ghostSm} inline-flex items-center gap-1.5`} disabled={checking}>
                <RefreshCw className="size-3.5" /> {checking ? "Conferindo…" : "Conferir agora"}
              </button>
            </form>
          )}
          {canSend && !editing && (
            <button type="button" className={ui.btnSm} onClick={() => setEditing(true)}>
              {c?.status === "SENT" ? "Reenviar contrato" : "Enviar contrato"}
            </button>
          )}
        </div>
      )}
      <Msg state={check} />
      {canSend && editing && (
        <form action={sendAction} className="flex flex-col gap-2">
          <input type="hidden" name="applicationId" value={p.applicationId} />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <label className={ui.label}>
              Cupom
              <input name="coupon" defaultValue={c?.coupon ?? p.coupon} required maxLength={20} className={`${ui.inputSm} font-mono uppercase`} />
            </label>
            <label className={ui.label}>
              Tipo
              <select name="category" defaultValue={c?.category ?? p.category} className={ui.inputSm}>
                {Object.entries(CATEGORY).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
            <label className={ui.label}>
              Comissão %
              <input name="rate" defaultValue={String(c?.rateBps != null ? c.rateBps / 100 : p.ratePct).replace(".", ",")} inputMode="decimal" required className={ui.inputSm} />
            </label>
            <label className={ui.label}>
              Desconto %
              <input name="discount" defaultValue={String(c?.discountBps != null ? c.discountBps / 100 : p.discountPct).replace(".", ",")} inputMode="decimal" required className={ui.inputSm} />
            </label>
          </div>
          {c?.status === "SENT" && <p className={ui.hint}>O contrato que ela ainda não assinou será cancelado no Autentique e o novo vai para o e-mail e o WhatsApp dela.</p>}
          <div className="flex flex-wrap gap-2">
            <button className={ui.btnSm} disabled={sending}>{sending ? "Enviando…" : "Enviar pelo Autentique"}</button>
            <button type="button" className={ui.ghostSm} onClick={() => setEditing(false)}>Cancelar</button>
          </div>
        </form>
      )}
      <Msg state={send} />
    </section>
  );
}
