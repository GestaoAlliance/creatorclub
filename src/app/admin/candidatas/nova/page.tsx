import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, PageHeader } from "@/components/ui/page";
import { ui } from "@/components/ui/styles";
import { can } from "@/lib/auth/permissions";
import { currentActor } from "@/lib/auth/current";
import { staffContext } from "@/lib/staff/context";
import { NewApplicationForm } from "./form";

export const dynamic = "force-dynamic";

// M4.1 (D-MANUALAPP): quem não veio por formulário entra como candidata pela equipe (Gestão e super admin).
export default async function NovaCandidataPage() {
  const actor = await currentActor();
  if (!actor) redirect("/entrar?next=/admin/candidatas/nova");
  const { brand } = await staffContext(actor);
  if (!brand || !can(actor.grants, "creators.edit", brand.id)) redirect("/admin/candidatas");
  return (
    <>
      <PageHeader title="Nova candidata" actions={<Link href="/admin/candidatas" className={ui.ghostSm}>Voltar</Link>}>
        Para quem não veio pelo site nem pelos formulários. Ela entra nas pendentes da {brand.name} e é aprovada do mesmo jeito
        (cupom, contrato e acesso ao portal).
      </PageHeader>
      <Card>
        <NewApplicationForm />
      </Card>
    </>
  );
}
