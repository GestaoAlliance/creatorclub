import { FileText } from "lucide-react";
import { badge, ui } from "@/components/ui/styles";
import { HelpTip } from "@/components/ui/tour";
import { formatBRL } from "@/domain";
import { WITHDRAWAL_STATUS_LABEL } from "@/lib/portal/withdrawals";
import type { withdrawalQueue } from "@/lib/withdrawals/decide";
import { CopyButton } from "@/components/portal/copy-button";
import { ApproveForm, BatchCheck, PayForm, RecheckForm, RejectForm } from "./forms";

type Row = Awaited<ReturnType<typeof withdrawalQueue>>[number];

const day = (d: Date) => d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "2-digit" });
const STATUS_BADGE = { REQUESTED: badge.amber, APPROVED: badge.sky, PAID: badge.green, REJECTED: badge.red, CANCELLED: badge.neutral } as const;

/** Selo da nota em cada pedido (D-NFCHECK): conferida pelo sistema, a conferir à mão, ou recibo de pessoa física. */
function NfSeal({ r }: { r: Row }) {
  if (r.individual) return <span className={badge.sky}>pessoa física · recibo</span>;
  if (r.nfCheck === "OK") return <span className={badge.green}>nota conferida</span>;
  if (r.nfCheck === "MANUAL") return <span className={badge.amber}>conferir a nota</span>;
  return r.hasNf ? <span className={badge.neutral}>nota sem conferência</span> : null;
}

/**
 * Fila de saques, um cartão por pedido (M1.1, D-WDAPPROVE). Em análise: quem aprova (Gestão) aprova ou recusa.
 * Aprovados: quem paga (Pagamento) faz o Pix e marca como pago, ou recusa. Cada pessoa só vê os botões do seu passo.
 * CPF/CNPJ e Pix só aparecem com `personal.fiscal`.
 */
export function SaquesTable({ rows }: { rows: Row[] }) {
  if (rows.length === 0) return <p className={ui.muted}>Nenhum saque aqui.</p>;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {rows.map((r, i) => {
        const over = r.availableBeforeCents !== null && r.amountCents > r.availableBeforeCents;
        const open = r.status === "REQUESTED" || r.status === "APPROVED";
        const acts = r.canApprove || r.canPay;
        return (
          <article key={r.id} data-tour="sq-cartao" className={ui.card}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold">{r.name}</p>
                <p className={ui.hint}>
                  pedido em {day(r.requestedAt)}
                  {r.approvedAt && ` · aprovado em ${day(r.approvedAt)}`}
                  {r.decidedAt && ` · ${r.status === "PAID" ? "pago" : "decidido"} em ${day(r.decidedAt)}`}
                </p>
              </div>
              <span className="flex flex-wrap justify-end gap-1.5">
                <NfSeal r={r} />
                <span className={STATUS_BADGE[r.status]}>{WITHDRAWAL_STATUS_LABEL[r.status]}</span>
                {i === 0 && <HelpTip id="sq-cartao" className="-my-1" />}
              </span>
            </div>
            <div>
              <p className="text-3xl font-semibold tabular-nums">{formatBRL(r.amountCents)}</p>
              {r.availableBeforeCents !== null && (
                <p className={`text-xs ${over ? "font-semibold text-red-700 dark:text-red-400" : "text-stone-500"}`}>
                  disponível {formatBRL(r.availableBeforeCents)}{over ? " · valor acima do saldo" : ""}
                </p>
              )}
            </div>
            <div className={`${ui.inset} flex flex-wrap items-center justify-between gap-3`}>
              <div className="min-w-0">
                <p className="text-xs text-stone-500">Chave Pix</p>
                <p className="truncate font-mono text-sm font-semibold">{r.pixKey ?? "—"}</p>
                {r.document && <p className={ui.hint}>{r.document}</p>}
              </div>
              <div className="flex flex-wrap gap-2">
                {r.pixKey && <CopyButton value={r.pixKey} label="Copiar" />}
                {r.individual && (
                  <a href={`/admin/saques/recibo/${r.id}`} target="_blank" rel="noopener noreferrer" className={ui.ghostSm}>
                    <FileText className="size-3.5" /> Recibo
                  </a>
                )}
                {r.hasNf && (
                  <a href={`/admin/saques/nf/${r.id}`} target="_blank" rel="noopener noreferrer" className={ui.ghostSm}>
                    <FileText className="size-3.5" /> Nota
                  </a>
                )}
                {r.canRecheck && <RecheckForm withdrawalId={r.id} />}
              </div>
            </div>
            {open && r.individual && (
              <p className="text-sm text-sky-800 dark:text-sky-300">Pessoa física: antes de pagar, confira no app do banco se o nome da chave Pix é o da creator.</p>
            )}
            {open && r.nfCheck === "MANUAL" && (
              <p className="text-sm text-amber-800 dark:text-amber-300">O sistema não conseguiu ler esta nota (foto, escaneada ou fora do padrão nacional). Abra a nota e confira tomadora, valor e CNPJ antes de aprovar.</p>
            )}
            {r.status === "REJECTED" && r.note && <p className="text-sm text-stone-600 dark:text-stone-400">Motivo: {r.note}</p>}
            {r.status === "REQUESTED" && !r.canApprove && <p className={ui.hint}>Esperando a aprovação da Gestão.</p>}
            {r.status === "APPROVED" && !r.canPay && <p className={ui.hint}>Aprovado: esperando o Pix do Pagamento.</p>}
            {acts && (
              <div data-tour="sq-pagar" className="relative flex flex-col gap-3 border-t border-stone-200/70 pt-4 dark:border-white/10">
                {i === 0 && <HelpTip id="sq-pagar" className="absolute -top-3.5 right-0 bg-white dark:bg-stone-900" />}
                {r.canApprove && <ApproveForm withdrawalId={r.id} label={formatBRL(r.amountCents)} />}
                {r.canPay && <BatchCheck withdrawalId={r.id} cents={r.amountCents} name={r.name} />}
                {r.canPay && <PayForm withdrawalId={r.id} label={formatBRL(r.amountCents)} />}
                <RejectForm withdrawalId={r.id} />
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}
