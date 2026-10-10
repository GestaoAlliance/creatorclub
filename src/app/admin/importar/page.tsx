import { redirect } from "next/navigation";
import { brandsWith } from "@/lib/auth/permissions";
import { currentActor } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { Card, PageHeader } from "@/components/ui/page";
import { ui } from "@/components/ui/styles";
import { ImportForm } from "./form";

export const dynamic = "force-dynamic";

// Importação das creators do app antigo (D-IMPORT). Só super admin. No visual do sistema (D-DESIGNALL).
export default async function ImportarPage() {
  const actor = await currentActor();
  if (!actor) redirect("/entrar?next=/admin/importar");
  if (brandsWith(actor.grants, "integrations.manage") !== "ALL") redirect("/conta");
  const brands = await db().brand.findMany({ where: { legacyId: { not: null }, archivedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } });

  return (
    <>
      <PageHeader title="Importar creators do app antigo">
        Cria contas, participações, cupons (sem tipo), donas e taxas a confirmar pela Ana. Pode rodar de novo: nada é sobrescrito, e o
        resultado mostra o que mudou no app antigo.
      </PageHeader>
      <Card>{brands.length === 0 ? <p className={ui.muted}>Nenhuma marca ligada ao app antigo.</p> : <ImportForm brands={brands} />}</Card>
    </>
  );
}
