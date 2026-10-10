import { redirect } from "next/navigation";
import { brandsWith } from "@/lib/auth/permissions";
import { currentActor } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { openingList } from "@/lib/withdrawals/opening";
import { PageHeader } from "@/components/ui/page";
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
    <>
      <PageHeader title="Saldo de abertura">
        Informe o total que já foi pago a cada creator antes do Creator Club (zero se nada) e como foi pago. Ao aprovar, esse valor sai do
        saldo como &quot;Saldo de abertura&quot; e o saque é liberado. Guarde os comprovantes: vamos precisar deles para conferir.
      </PageHeader>
      <OpeningTable rows={rows} />
    </>
  );
}
