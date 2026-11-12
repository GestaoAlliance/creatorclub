import { redirect } from "next/navigation";
import { GlassLight } from "@/components/ui/glass-light";
import { ui } from "@/components/ui/styles";
import { brandsWith } from "@/lib/auth/permissions";
import { currentActor } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { scopedActor, staffContext } from "@/lib/staff/context";
import { openingList } from "@/lib/withdrawals/opening";
import { OpeningBoard } from "./table";

export const dynamic = "force-dynamic";

// Saldo de abertura (E6, D-OPEN): o Pagamento informa o que já foi pago por fora e libera o saque. Visual D-PAYBOARD.
export default async function OpeningPage() {
  const actor = await currentActor();
  if (!actor) redirect("/entrar?next=/admin/abertura");
  const allowed = brandsWith(actor.grants, "withdrawals.manage");
  if (allowed !== "ALL" && allowed.length === 0) redirect("/conta");
  // A1 (D-ALLIANCE): só a marca escolhida no topo.
  const { brand } = await staffContext(actor);
  if (!brand) return <p className={ui.muted}>Nenhuma marca.</p>;
  const rows = await openingList(db(), scopedActor(actor, brand.id));
  return (
    <GlassLight className="dash flex flex-col gap-4">
      <OpeningBoard rows={rows} brandName={brand.name} />
    </GlassLight>
  );
}
