import { redirect } from "next/navigation";
import { brandsWith } from "@/lib/auth/permissions";
import { currentActor } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { openingList } from "@/lib/withdrawals/opening";
import { OpeningTable } from "./table";

export const dynamic = "force-dynamic";

// Saldo de abertura (E6, D-OPEN): o Pagamento informa o que já foi pago por fora e libera o saque. Tela simples.
export default async function OpeningPage() {
  const actor = await currentActor();
  if (!actor) redirect("/entrar?next=/admin/abertura");
  const allowed = brandsWith(actor.grants, "withdrawals.manage");
  if (allowed !== "ALL" && allowed.length === 0) redirect("/conta");
  const rows = await openingList(db(), actor);
  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-4 px-6 py-10">
      <h1 className="text-2xl font-bold">Saldo de abertura</h1>
      <p className="text-sm">
        A comissão no v2 é a soma das vendas desde 01/06. Informe o total que <strong>já foi pago</strong> a cada creator antes do Creator
        Club (zero se nada) e como foi pago. Ao aprovar, esse valor sai do saldo como &quot;Saldo de abertura&quot; e o saque da creator é
        liberado. Só depois que a Ana marcar na ficha da creator que conferiu os números. Guarde os comprovantes: vamos precisar deles para conferir.
      </p>
      <OpeningTable rows={rows} />
    </main>
  );
}
