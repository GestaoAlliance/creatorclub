import Link from "next/link";
import { redirect } from "next/navigation";
import { formatBRL } from "@/domain";
import { brandsWith } from "@/lib/auth/permissions";
import { currentActor } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { WITHDRAWAL_STATUS_LABEL } from "@/lib/portal/withdrawals";
import { withdrawalQueue } from "@/lib/withdrawals/decide";
import { Card, Kpi, PageHeader } from "@/components/ui/page";
import { ui } from "@/components/ui/styles";
import { SaquesTable } from "./table";

export const dynamic = "force-dynamic";

// Fila de saques do Pagamento (E8, D-WDDECIDE). Tela simples da equipe (D-ADMINUI).
export default async function SaquesPage({ searchParams }: { searchParams: Promise<{ ver?: string }> }) {
  const actor = await currentActor();
  if (!actor) redirect("/entrar?next=/admin/saques");
  const allowed = brandsWith(actor.grants, "withdrawals.manage");
  if (allowed !== "ALL" && allowed.length === 0) redirect("/conta");
  const { ver } = await searchParams;
  const decided = ver === "decididos";
  const rows = await withdrawalQueue(db(), actor, decided ? "DECIDED" : "REQUESTED");
  const total = rows.reduce((s, r) => s + r.amountCents, 0);

  return (
    <>
      <PageHeader title="Saques">
        Confira a nota (valor e CNPJ do tomador), faça o Pix e marque como pago. Se algo não bate, recuse com o motivo: a creator vê e pode
        pedir de novo.
      </PageHeader>
      <nav aria-label="Situação" className="flex flex-wrap gap-2">
        <Link href="/admin/saques" className={!decided ? ui.pillOn : ui.pill}>{WITHDRAWAL_STATUS_LABEL.REQUESTED}</Link>
        <Link href="/admin/saques?ver=decididos" className={decided ? ui.pillOn : ui.pill}>Decididos</Link>
      </nav>
      {!decided && (
        <Card>
          <div className="grid grid-cols-2 gap-4">
            <Kpi label="Pedidos em análise" value={rows.length} tone={rows.length ? "amber" : undefined} />
            <Kpi label="Total a pagar" value={formatBRL(total)} />
          </div>
        </Card>
      )}
      <SaquesTable rows={rows} />
    </>
  );
}
