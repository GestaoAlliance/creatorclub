import Link from "next/link";
import { redirect } from "next/navigation";
import { formatBRL } from "@/domain";
import { brandsWith } from "@/lib/auth/permissions";
import { currentActor } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { WITHDRAWAL_STATUS_LABEL } from "@/lib/portal/withdrawals";
import { withdrawalQueue } from "@/lib/withdrawals/decide";
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
    <main className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-10">
      <h1 className="text-2xl font-bold">Saques</h1>
      <nav className="flex gap-3 text-sm">
        <Link href="/admin/saques" className={!decided ? "font-semibold" : "underline"}>{WITHDRAWAL_STATUS_LABEL.REQUESTED}</Link>
        <Link href="/admin/saques?ver=decididos" className={decided ? "font-semibold" : "underline"}>Decididos</Link>
      </nav>
      {!decided && (
        <p className="text-sm">
          <strong>{rows.length}</strong> pedido{rows.length === 1 ? "" : "s"} em análise · {formatBRL(total)}. Confira a nota (valor e CNPJ do
          tomador), faça o Pix e marque como pago. Se algo não bate, recuse com o motivo: a creator vê e pode pedir de novo.
        </p>
      )}
      <SaquesTable rows={rows} />
    </main>
  );
}
