import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, PageHeader } from "@/components/ui/page";
import { ui } from "@/components/ui/styles";
import { can } from "@/lib/auth/permissions";
import { currentActor } from "@/lib/auth/current";
import { brandTags } from "@/lib/creators/tags";
import { db } from "@/lib/db";
import { staffContext } from "@/lib/staff/context";
import { CampaignForm } from "../forms";

export const dynamic = "force-dynamic";

export default async function NovaCampanhaPage() {
  const actor = await currentActor();
  if (!actor) redirect("/entrar?next=/admin/campanhas/nova");
  const { brand } = await staffContext(actor);
  if (!brand || !can(actor.grants, "creators.edit", brand.id)) redirect("/admin/campanhas");
  const tags = await brandTags(db(), brand.id);
  return (
    <>
      <PageHeader title="Nova campanha" actions={<Link href="/admin/campanhas" className={ui.ghostSm}>Voltar</Link>}>
        Fica como rascunho até você publicar. Depois de publicada, período, público e prêmios não mudam.
      </PageHeader>
      <Card>
        <CampaignForm tags={tags} v={{ name: "", briefing: "", startDay: "", endDay: "", categories: [], tagIds: [], rankingPrizes: [], goal: "", goalPrize: "", allianceOsUrl: "" }} />
      </Card>
    </>
  );
}
