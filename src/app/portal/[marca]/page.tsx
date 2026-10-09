import { HomeView } from "@/components/portal/home-view";
import { db } from "@/lib/db";
import { currentPortalContext } from "@/lib/portal/current";
import { portalSummary } from "@/lib/portal/home";

export const dynamic = "force-dynamic";

// Início do portal (E7.2). O acesso é conferido de novo aqui (cada página decide, não só a moldura).
export default async function PortalHome({ params }: { params: Promise<{ marca: string }> }) {
  const { marca } = await params;
  const ctx = await currentPortalContext(marca);
  return <HomeView s={await portalSummary(db(), ctx)} base={`/portal/${ctx.brand.slug}`} />;
}
