import { Compass } from "lucide-react";
import Link from "next/link";
import { Card } from "@/components/ui/page";
import { ui } from "@/components/ui/styles";
import { formatBRL, ORIGIN_LABEL } from "@/domain";
import type { OriginSummaryRow } from "@/lib/creators/origin";

const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");

/** Aba Origem do Desempenho (D-ORIGIN): por formulário e por hunter, quem se inscreveu, entrou e vende. */
export function OriginTab({ rows, monthLabel }: { rows: OriginSummaryRow[]; monthLabel: string }) {
  return (
    <Card title="De onde vêm as creators" icon={<Compass className="size-4" />}>
      <p className={ui.hint}>
        Inscrições e aprovações contam desde o início; ativas é hoje; vendas são de {monthLabel}. Creators importadas sem origem aparecem como &quot;Não informada&quot;: marque na ficha.
      </p>
      {rows.length === 0 ? (
        <p className={ui.muted}>Nenhuma creator ou inscrição ainda.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-stone-500">
                <th className="py-2 pr-3 font-medium">Origem</th>
                <th className="px-3 py-2 text-right font-medium">Inscritas</th>
                <th className="px-3 py-2 text-right font-medium">Aprovadas</th>
                <th className="px-3 py-2 text-right font-medium">Ativas</th>
                <th className="px-3 py-2 text-right font-medium">Venderam</th>
                <th className="py-2 pl-3 text-right font-medium">Vendas</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-200/70 dark:divide-white/10">
              {rows.map((r) => (
                <tr key={r.key}>
                  <td className="py-2.5 pr-3">
                    <Link href={`/admin/creators?origem=${encodeURIComponent(r.key)}`} className="font-medium hover:underline">
                      {ORIGIN_LABEL[r.origin.kind]}
                    </Link>
                    {r.origin.hunter && <span className="block text-xs text-stone-500">{r.origin.hunter.name}</span>}
                    {r.origin.kind === "HUNTER" && !r.origin.hunter && <span className="block text-xs text-stone-500">hunter não identificado (sem código)</span>}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{r.applications || "—"}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {r.approved || "—"}
                    {r.applications > 0 && <span className="block text-xs text-stone-500">{pct(r.approved, r.applications)} das inscritas</span>}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{r.active}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {r.sellers}
                    {r.active > 0 && <span className="block text-xs text-stone-500">{pct(r.sellers, r.active)} das ativas</span>}
                  </td>
                  <td className="py-2.5 pl-3 text-right font-semibold tabular-nums">{formatBRL(r.salesCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
