import { HomeView } from "@/components/portal/home-view";
import { KitBanner } from "@/components/portal/kit-banner";
import { TiktokAsk } from "@/components/portal/tiktok-ask";
import { db } from "@/lib/db";
import { currentPortalContext } from "@/lib/portal/current";
import { portalSummary } from "@/lib/portal/home";

export const dynamic = "force-dynamic";

// Início do portal (E7.2). O acesso é conferido de novo aqui (cada página decide, não só a moldura).
export default async function PortalHome({ params }: { params: Promise<{ marca: string }> }) {
  const { marca } = await params;
  const ctx = await currentPortalContext(marca);
  const base = `/portal/${ctx.brand.slug}`;
  const [summary, kit, account] = await Promise.all([
    portalSummary(db(), ctx),
    // Kit esperando escolha (D-WELCOMEKIT, D-KIT): aviso no topo, boas-vindas primeiro.
    db().kitGrant.findFirst({ where: { creatorId: ctx.creatorId, brandId: ctx.brand.id, status: "PENDING" }, orderBy: [{ kind: "desc" }, { month: "asc" }], select: { kind: true, products: true } }),
    db().creator.findUniqueOrThrow({ where: { id: ctx.creatorId }, select: { account: { select: { tiktok: true } } } }).then((c) => c.account),
  ]);
  return (
    <div className="flex flex-col gap-6">
      {kit && <KitBanner base={base} products={kit.products} welcome={kit.kind === "WELCOME"} />}
      {!account.tiktok && <TiktokAsk marca={ctx.brand.slug} />}
      <HomeView s={summary} base={base} ugc={ctx.ugcOnly} />
    </div>
  );
}
