import { CampaignsView } from "@/components/portal/campaigns-view";
import { portalCampaigns } from "@/lib/campaigns/campaigns";
import { db } from "@/lib/db";
import { currentPortalContext } from "@/lib/portal/current";

export const dynamic = "force-dynamic";

// Campanhas e desafios (M4.5, D-CAMPAIGN): briefing, inscrição e placar.
export default async function PortalCampaigns({ params }: { params: Promise<{ marca: string }> }) {
  const { marca } = await params;
  const ctx = await currentPortalContext(marca);
  const campaigns = await portalCampaigns(db(), ctx);
  return (
    <>
      <h1 className="text-xl font-semibold tracking-tight">Campanhas</h1>
      <CampaignsView marca={ctx.brand.slug} campaigns={campaigns} />
    </>
  );
}
