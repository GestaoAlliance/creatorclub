"use client";

import { FileSignature, RefreshCw } from "lucide-react";
import { useActionState } from "react";
import { Msg } from "@/components/ui/msg";
import { badge, ui } from "@/components/ui/styles";
import { contractBadge } from "@/domain";
import { checkContractAction, sendContractAction } from "./actions";

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
 * Contrato pelo Autentique depois da aprovação (D-CONTRACTFLOW): situação, link de assinatura, conferir agora e
 * reenviar (cancela o contrato ainda não assinado e manda de novo, com os valores da aprovação).
 */
export function ContractBox(p: { creatorId: string; contract: ContractInfo | null; error: string | null; awaiting: { signed: boolean } | null; canManage: boolean }) {
  const c = p.contract;
  const b = p.awaiting?.signed && c?.status === "SIGNED" ? { label: "assinado: ativando a parceria", tone: "amber" as const } : !p.awaiting && c?.status === "SIGNED" ? { label: "parceria ativa", tone: "green" as const } : contractBadge(c, p.error);
  const [check, checkAction, checking] = useActionState(checkContractAction, undefined);
  const [send, sendAction, sending] = useActionState(sendContractAction, undefined);
  const canSend = p.canManage && p.awaiting !== null && !p.awaiting.signed;
  return (
    <section className={`${ui.inset} flex flex-col gap-2 text-sm`}>
      <p className="flex flex-wrap items-center gap-2">
        <FileSignature className="size-4 text-stone-500" />
        <span className="font-medium">Contrato (Autentique)</span>
        <span className={badge[b.tone]}>{b.label}</span>
        {c?.sandbox && <span className={badge.neutral}>modo teste</span>}
      </p>
      {!c && p.error && <p className="text-red-800 dark:text-red-300">Não saiu sozinho: {p.error}</p>}
      {!c && !p.error && <p className={ui.hint}>O contrato sai sozinho em até 1 minuto depois da aprovação.</p>}
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
          {c.lastError && <p className="text-xs text-amber-800 dark:text-amber-300">Último aviso: {c.lastError}</p>}
          {c.status === "SENT" && c.signLink && (
            <p className="text-xs">
              Link de assinatura: <a href={c.signLink} target="_blank" rel="noopener noreferrer" className={ui.link}>{c.signLink}</a>
            </p>
          )}
        </>
      )}
      {p.canManage && p.awaiting && (
        <div className="flex flex-wrap items-center gap-2">
          {(c?.status === "SENT" || p.awaiting.signed) && (
            <form action={checkAction}>
              <input type="hidden" name="creatorId" value={p.creatorId} />
              <button className={`${ui.ghostSm} inline-flex items-center gap-1.5`} disabled={checking}>
                <RefreshCw className="size-3.5" /> {checking ? "Conferindo…" : "Conferir agora"}
              </button>
            </form>
          )}
          {canSend && (
            <form action={sendAction}>
              <input type="hidden" name="creatorId" value={p.creatorId} />
              <button className={ui.btnSm} disabled={sending}>{sending ? "Enviando…" : c?.status === "SENT" ? "Reenviar contrato" : "Enviar contrato"}</button>
            </form>
          )}
        </div>
      )}
      <Msg state={check} />
      <Msg state={send} />
    </section>
  );
}
