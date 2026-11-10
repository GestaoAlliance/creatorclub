import Link from "next/link";
import { Card } from "@/components/ui/page";
import { badge, ui } from "@/components/ui/styles";
import { formatBRL } from "@/domain";
import type { OpeningRow } from "@/lib/withdrawals/opening";
import { OpeningForm } from "./forms";

const day = (d: Date) => d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "2-digit" });

/** Pendentes (com o formulário) e já liberadas (com o que foi lançado). */
export function OpeningTable({ rows }: { rows: OpeningRow[] }) {
  const pending = rows.filter((r) => !r.unlockedAt && r.status !== "DEACTIVATED");
  // D-OPENINGBYPAY: o Pagamento confere e aprova direto (sem esperar a conferência da gestora).
  const ready = pending;
  const done = rows.filter((r) => r.unlockedAt);
  return (
    <>
      <Card title={`A aprovar (${ready.length})`}>
        {ready.length === 0 ? (
          <p className={ui.muted}>Nenhuma creator esperando o saldo de abertura.</p>
        ) : (
          <ul className={ui.list}>
            {ready.map((r) => (
              <li key={r.creatorId} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <Link href={`/admin/creators/${r.creatorId}`} className="font-semibold hover:underline">{r.name}</Link>
                  <span className="text-sm">
                    <span className="text-stone-500">comissão no v2 </span>
                    <strong className="tabular-nums">{formatBRL(r.ledgerCents)}</strong>
                  </span>
                </div>
                <OpeningForm creatorId={r.creatorId} name={r.name} ledgerCents={r.ledgerCents} legacyPayments={r.legacyPayments} paidInfo={r.paid} />
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title={`Saque liberado (${done.length})`}>
        {done.length === 0 ? (
          <p className={ui.muted}>Nenhuma ainda.</p>
        ) : (
          <ul className={ui.list}>
            {done.map((r) => (
              <li key={r.creatorId} className="flex flex-wrap items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <Link href={`/admin/creators/${r.creatorId}`} className="font-medium hover:underline">{r.name}</Link>
                  <p className={ui.hint}>
                    liberado em {day(r.unlockedAt!)} · já pago {r.openingCents === null ? "nada" : formatBRL(-r.openingCents)}
                    {r.openingNote && ` · ${r.openingNote.replace(/^Já pago antes do Creator Club: /, "")}`}
                  </p>
                </div>
                <span className={r.ledgerCents < 0 ? badge.red : badge.green}>saldo {formatBRL(r.ledgerCents)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
