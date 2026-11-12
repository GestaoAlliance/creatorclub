import { headers } from "next/headers";
import { CampaignsView } from "@/components/portal/campaigns-view";
import { dayKey } from "@/domain";
import { portalCampaignPrizes, portalCampaigns } from "@/lib/campaigns/campaigns";
import { db } from "@/lib/db";
import { portalCoupons } from "@/lib/portal/coupons";
import { currentPortalContext } from "@/lib/portal/current";
import { publicOrigin } from "@/lib/site";

export const dynamic = "force-dynamic";

// Campanhas e desafios (M4.5, D-CAMPAIGN; D-PORTALCAMPAIGN): faixa da campanha da vez, prêmios ganhos e as campanhas
// por momento (acontecendo, em breve, encerradas), com placar, posts da campanha e compartilhar o cupom.
export default async function PortalCampaigns({ params }: { params: Promise<{ marca: string }> }) {
  const { marca } = await params;
  const ctx = await currentPortalContext(marca);
  const [campaigns, prizes, coupons, brand] = await Promise.all([
    portalCampaigns(db(), ctx),
    portalCampaignPrizes(db(), ctx),
    portalCoupons(db(), ctx),
    db().brand.findUniqueOrThrow({ where: { id: ctx.brand.id }, select: { timezone: true } }),
  ]);
  const first = coupons[0];
  const coupon = first ? await db().coupon.findFirst({ where: { brandId: ctx.brand.id, code: first.code }, select: { discountBps: true } }) : null;
  const share = first && ctx.status !== "DEACTIVATED" ? { code: first.code, link: `${publicOrigin(await headers())}${first.path}`, discountBps: coupon?.discountBps ?? null, brandName: ctx.brand.name } : null;
  return (
    <CampaignsView
      marca={ctx.brand.slug}
      campaigns={campaigns}
      prizes={prizes}
      share={share}
      // Visualização da equipe (D-VIEWAS): sem registrar post.
      today={ctx.viewAs ? null : dayKey(new Date(), brand.timezone)}
    />
  );
}
