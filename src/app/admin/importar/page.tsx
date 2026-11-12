import { GlassLight } from "@/components/ui/glass-light";
import { HistoryCard, SettingsHero } from "@/components/staff/settings-hero";
import { HISTORY_ACTIONS } from "@/lib/settings/health";
import { redirect } from "next/navigation";
import { brandsWith } from "@/lib/auth/permissions";
import { currentActor } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { staffContext } from "@/lib/staff/context";
import { Card } from "@/components/ui/page";
import { ui } from "@/components/ui/styles";
import { ImportForm } from "./form";

export const dynamic = "force-dynamic";

// Importação das creators do app antigo (D-IMPORT). Só super admin. No visual do sistema (D-DESIGNALL).
export default async function ImportarPage() {
  const actor = await currentActor();
  if (!actor) redirect("/entrar?next=/admin/importar");
  if (brandsWith(actor.grants, "integrations.manage") !== "ALL") redirect("/conta");
  // A1 (D-ALLIANCE): só a marca escolhida no topo.
  const { brand } = await staffContext(actor);
  const brands = brand ? await db().brand.findMany({ where: { id: brand.id, legacyId: { not: null } }, select: { id: true, name: true } }) : [];

  return (
    <GlassLight className="dash flex flex-col gap-4">
      <SettingsHero actor={actor} brandId={brand?.id ?? null} brandName={brand?.name ?? ""} active="importar" title="Importar creators do app antigo">
        Cria contas, participações, cupons (sem tipo), donas e taxas a confirmar pela Ana. Pode rodar de novo: nada é sobrescrito, e o
        resultado mostra o que mudou no app antigo.
      </SettingsHero>
      <Card>{brands.length === 0 ? <p className={ui.muted}>{brand ? `A ${brand.name} não está ligada ao app antigo.` : "Nenhuma marca."}</p> : <ImportForm brands={brands} />}</Card>
      <HistoryCard brandId={brand?.id ?? null} prefixes={HISTORY_ACTIONS.importar} />
    </GlassLight>
  );
}
