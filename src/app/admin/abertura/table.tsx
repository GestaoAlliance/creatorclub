import Link from "next/link";
import { formatBRL } from "@/domain";
import type { OpeningRow } from "@/lib/withdrawals/opening";
import { OpeningForm } from "./forms";

const day = (d: Date) => d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "2-digit" });

/** Pendentes (com o formulário) e já liberadas (com o que foi lançado). */
export function OpeningTable({ rows }: { rows: OpeningRow[] }) {
  const pending = rows.filter((r) => !r.unlockedAt && r.status !== "DEACTIVATED");
  const done = rows.filter((r) => r.unlockedAt);
  return (
    <>
      <h2 className="font-semibold">A aprovar ({pending.length})</h2>
      {pending.length === 0 ? (
        <p className="text-sm text-stone-500">Nenhuma creator pendente.</p>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-stone-300 text-left">
              <th className="py-2 pr-3">Creator</th>
              <th className="py-2 pr-3">Comissão no v2</th>
              <th className="py-2">Abertura</th>
            </tr>
          </thead>
          <tbody>
            {pending.map((r) => (
              <tr key={r.creatorId} className="border-b border-stone-100 align-top">
                <td className="py-2 pr-3"><Link href={`/admin/creators/${r.creatorId}`} className="underline">{r.name}</Link></td>
                <td className="py-2 pr-3 tabular-nums">{formatBRL(r.ledgerCents)}</td>
                <td className="py-2">
                  {r.ready ? (
                    <OpeningForm creatorId={r.creatorId} name={r.name} ledgerCents={r.ledgerCents} />
                  ) : (
                    <span className="text-xs text-amber-700">aguardando a Ana marcar "Conferi os números" na ficha</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <h2 className="mt-4 font-semibold">Saque liberado ({done.length})</h2>
      {done.length > 0 && (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-stone-300 text-left">
              <th className="py-2 pr-3">Creator</th>
              <th className="py-2 pr-3">Já pago (abertura)</th>
              <th className="py-2 pr-3">Saldo hoje</th>
              <th className="py-2">Liberado em</th>
            </tr>
          </thead>
          <tbody>
            {done.map((r) => (
              <tr key={r.creatorId} className="border-b border-stone-100 align-top">
                <td className="py-2 pr-3"><Link href={`/admin/creators/${r.creatorId}`} className="underline">{r.name}</Link></td>
                <td className="py-2 pr-3 text-xs">
                  {r.openingCents === null ? "nada" : <span className="tabular-nums">{formatBRL(-r.openingCents)}</span>}
                  {r.openingNote && <div className="text-stone-500">{r.openingNote}</div>}
                </td>
                <td className={`py-2 pr-3 tabular-nums ${r.ledgerCents < 0 ? "text-red-700" : ""}`}>{formatBRL(r.ledgerCents)}</td>
                <td className="py-2 text-xs">{day(r.unlockedAt!)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
