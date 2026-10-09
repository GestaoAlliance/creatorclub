import { formatBRL } from "@/domain";
import { WITHDRAWAL_STATUS_LABEL } from "@/lib/portal/withdrawals";
import type { withdrawalQueue } from "@/lib/withdrawals/decide";
import { PayForm, RejectForm } from "./forms";

type Row = Awaited<ReturnType<typeof withdrawalQueue>>[number];

const day = (d: Date) => d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "2-digit" });

/** Tabela da fila de saques. CPF/CNPJ e Pix só aparecem com `personal.fiscal`. */
export function SaquesTable({ rows }: { rows: Row[] }) {
  if (rows.length === 0) return <p className="text-sm text-stone-500">Nenhum saque aqui.</p>;
  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="border-b border-stone-300 text-left">
          <th className="py-2 pr-3">Creator</th>
          <th className="py-2 pr-3">Valor</th>
          <th className="py-2 pr-3">Pix e documento</th>
          <th className="py-2 pr-3">Nota</th>
          <th className="py-2">Situação</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const over = r.availableBeforeCents !== null && r.amountCents > r.availableBeforeCents;
          return (
            <tr key={r.id} className="border-b border-stone-100 align-top">
              <td className="py-2 pr-3">
                <div>{r.name}</div>
                <div className="text-xs text-stone-500">pedido em {day(r.requestedAt)}</div>
              </td>
              <td className="py-2 pr-3">
                <div className="font-semibold tabular-nums">{formatBRL(r.amountCents)}</div>
                {r.availableBeforeCents !== null && (
                  <div className={`text-xs ${over ? "text-red-700" : "text-stone-500"}`}>
                    disponível {formatBRL(r.availableBeforeCents)}{over ? " · valor acima do saldo" : ""}
                  </div>
                )}
              </td>
              <td className="py-2 pr-3 text-xs">
                <div className="font-mono">{r.pixKey ?? "—"}</div>
                {r.document && <div className="text-stone-500">{r.document}</div>}
              </td>
              <td className="py-2 pr-3 text-xs">
                {r.hasNf ? <a href={`/admin/saques/nf/${r.id}`} target="_blank" rel="noopener noreferrer" className="underline">Abrir PDF</a> : "—"}
              </td>
              <td className="flex flex-col gap-1 py-2">
                <span className="font-semibold">{WITHDRAWAL_STATUS_LABEL[r.status]}</span>
                {r.decidedAt && <span className="text-xs">em {day(r.decidedAt)}</span>}
                {r.status === "REJECTED" && r.note && <span className="text-xs text-stone-600">{r.note}</span>}
                {r.status === "REQUESTED" && (
                  <>
                    <PayForm withdrawalId={r.id} label={formatBRL(r.amountCents)} />
                    <RejectForm withdrawalId={r.id} />
                  </>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
