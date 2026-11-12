import { redirect } from "next/navigation";
import { GlassLight } from "@/components/ui/glass-light";
import { ui } from "@/components/ui/styles";
import { can } from "@/lib/auth/permissions";
import { currentActor } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { paymentsCheck } from "@/lib/sheets/pagamentos";
import { staffContext } from "@/lib/staff/context";
import { CheckBoard } from "./board";

export const dynamic = "force-dynamic";

const fmt = (d: Date | null) => (d ? d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).replace(",", "") : "—");

// Conferência da planilha "Pagamentos influencers" (S3, D-SHEETREADONLY): só compara, nada de dinheiro muda. Visual D-PAYBOARD.
export default async function PaymentsCheckPage() {
  const actor = await currentActor();
  if (!actor) redirect("/entrar?next=/admin/saques/conferencia");
  const { brand } = await staffContext(actor);
  if (!brand) return <p className={ui.muted}>Nenhuma marca.</p>;
  if (!can(actor.grants, "money.view", brand.id)) redirect("/conta");
  const { lastReadAt, rows } = await paymentsCheck(db(), brand.id);
  return (
    <GlassLight className="dash flex flex-col gap-4">
      <CheckBoard rows={rows} brandName={brand.name} lastRead={fmt(lastReadAt)} />
    </GlassLight>
  );
}
