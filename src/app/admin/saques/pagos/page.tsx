import { redirect } from "next/navigation";
import { GlassLight } from "@/components/ui/glass-light";
import { ui } from "@/components/ui/styles";
import { can } from "@/lib/auth/permissions";
import { currentActor } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { staffContext } from "@/lib/staff/context";
import { paidList } from "@/lib/withdrawals/paid";
import { PaidBoard } from "./board";

export const dynamic = "force-dynamic";

// Pagos (D-PAIDLIST): o que foi pago no mês do pagamento, separado em CNPJ e CPF, com os pagamentos de antes do sistema.
export default async function PaidPage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const actor = await currentActor();
  if (!actor) redirect("/entrar?next=/admin/saques/pagos");
  const { brand } = await staffContext(actor);
  if (!brand) return <p className={ui.muted}>Nenhuma marca.</p>;
  if (!can(actor.grants, "withdrawals.view", brand.id)) redirect("/conta");
  const { mes } = await searchParams;
  const data = await paidList(db(), actor, brand.id, mes);
  return (
    <GlassLight className="dash flex flex-col gap-4">
      <PaidBoard brandName={brand.name} data={data} />
    </GlassLight>
  );
}
