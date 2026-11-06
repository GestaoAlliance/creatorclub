import { CreditCard, Download } from "lucide-react";
import Link from "next/link";
import { Card } from "@/components/ui/page";
import { ui } from "@/components/ui/styles";

/**
 * D-ALELOCARD: pedido do cartão Alelo das creators de pessoa física (modelo da Alelo). Quem entra na planilha fica
 * marcado e não sai de novo; quem ainda não tem os dados aparece listado.
 */
export function AleloCardBox(p: { ready: number; incomplete: { id: string; name: string; missing: string[] }[] }) {
  if (p.ready === 0 && p.incomplete.length === 0) return null;
  return (
    <Card title="Cartão Alelo (pessoa física)" icon={<CreditCard className="size-4" />}>
      <p className={ui.hint}>Planilha no modelo da Alelo (pedido de cartão personalizado) com as creators de CPF que ainda não tiveram o cartão pedido. Ao baixar, elas ficam marcadas e não entram de novo.</p>
      {p.ready > 0 ? (
        <form action="/admin/saques/alelo" method="post">
          <button className={`${ui.btnSm} inline-flex items-center gap-1.5`}>
            <Download className="size-4" /> Baixar planilha de cartões Alelo ({p.ready})
          </button>
        </form>
      ) : (
        <p className="text-sm">Ninguém pronto para o pedido de cartão agora.</p>
      )}
      {p.incomplete.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer">{p.incomplete.length} ainda sem os dados que a Alelo pede</summary>
          <ul className="mt-2 flex flex-col gap-1">
            {p.incomplete.map((c) => (
              <li key={c.id}>
                <Link href={`/admin/creators/${c.id}`} className={ui.link}>{c.name}</Link> <span className={ui.hint}>falta {c.missing.join(", ")}</span>
              </li>
            ))}
          </ul>
          <p className={`${ui.hint} mt-2`}>O nome da mãe ela informa no portal (aparece um aviso no Início).</p>
        </details>
      )}
    </Card>
  );
}
