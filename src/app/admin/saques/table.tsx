import { FileText } from "lucide-react";
import { badge, ui } from "@/components/ui/styles";
import { formatBRL } from "@/domain";
import { WITHDRAWAL_STATUS_LABEL } from "@/lib/portal/withdrawals";
import type { withdrawalQueue } from "@/lib/withdrawals/decide";
import { CopyButton } from "@/components/portal/copy-button";
import { PayForm, RejectForm } from "./forms";

type Row = Awaited<ReturnType<typeof withdrawalQueue>>[number];

const day = (d: Date) => d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "2-digit" });
const STATUS_BADGE = { REQUESTED: badge.amber, PAID: badge.green, REJECTED: badge.red, CANCELLED: badge.neutral } as const;

/** Fila de saques, um cartão por pedido. CPF/CNPJ e Pix só aparecem com `personal.fiscal`. */
export function SaquesTable({ rows }: { rows: Row[] }) {
  if (rows.length === 0) return <p className={ui.muted}>Nenhum saque aqui.</p>;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {rows.map((r) => {
        const over = r.availableBeforeCents !== null && r.amountCents > r.availableBeforeCents;
        return (
          <article key={r.id} className={ui.card}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold">{r.name}</p>
                <p className={ui.hint}>pedido em {day(r.requestedAt)}{r.decidedAt && ` · decidido em ${day(r.decidedAt)}`}</p>
              </div>
              <span className="flex flex-wrap justify-end gap-1.5">
                {r.nfCheck === "OK" && <span className={badge.green}>nota conferida</span>}
                {r.nfCheck === "MANUAL" && <span className={badge.amber}>conferir a nota</span>}
                <span className={STATUS_BADGE[r.status]}>{WITHDRAWAL_STATUS_LABEL[r.status]}</span>
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
              <div className="flex gap-2">
                {r.pixKey && <CopyButton value={r.pixKey} label="Copiar" />}
                {r.hasNf && (
                  <a href={`/admin/saques/nf/${r.id}`} target="_blank" rel="noopener noreferrer" className={ui.ghostSm}>
                    <FileText className="size-3.5" /> Nota
                  </a>
                )}
              </div>
            </div>
            {r.status === "REQUESTED" && r.nfCheck === "MANUAL" && (
              <p className="text-sm text-amber-800 dark:text-amber-300">O sistema não conseguiu ler esta nota (foto, escaneada ou fora do padrão nacional). Abra a nota e confira tomadora, valor e CNPJ antes de pagar.</p>
            )}
            {r.status === "REJECTED" && r.note && <p className="text-sm text-stone-600 dark:text-stone-400">Motivo: {r.note}</p>}
            {r.status === "REQUESTED" && (
              <div className="flex flex-col gap-3 border-t border-stone-200/70 pt-4 dark:border-white/10">
                <PayForm withdrawalId={r.id} label={formatBRL(r.amountCents)} />
                <RejectForm withdrawalId={r.id} />
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}
