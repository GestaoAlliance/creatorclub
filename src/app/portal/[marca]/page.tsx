import { headers } from "next/headers";
import { HomeView } from "@/components/portal/home-view";
import { KitBanner } from "@/components/portal/kit-banner";
import { TiktokAsk } from "@/components/portal/tiktok-ask";
import { db } from "@/lib/db";
import { currentPortalContext } from "@/lib/portal/current";
import { portalCoupons } from "@/lib/portal/coupons";
import { portalSummary } from "@/lib/portal/home";

export const dynamic = "force-dynamic";

// Início do portal (E7.2; M0.0.5: com o cupom, o link e os cliques). O acesso é conferido de novo aqui (cada página decide, não só a moldura).
export default async function PortalHome({ params }: { params: Promise<{ marca: string }> }) {
  const { marca } = await params;
  const ctx = await currentPortalContext(marca);
  const base = `/portal/${ctx.brand.slug}`;
  const [summary, kit, account, coupons] = await Promise.all([
    portalSummary(db(), ctx),
    // Kit esperando escolha (D-WELCOMEKIT, D-KIT): aviso no topo, boas-vindas primeiro.
    db().kitGrant.findFirst({ where: { creatorId: ctx.creatorId, brandId: ctx.brand.id, status: "PENDING" }, orderBy: [{ kind: "desc" }, { month: "asc" }], select: { kind: true, products: true } }),
    db().creator.findUniqueOrThrow({ where: { id: ctx.creatorId }, select: { account: { select: { tiktok: true } } } }).then((c) => c.account),
    portalCoupons(db(), ctx),
  ]);
  // O link usa o endereço por onde o portal foi aberto (funciona no domínio novo sem mudar nada).
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return (
    <div className="flex flex-col gap-6">
      {kit && <KitBanner base={base} brandSlug={ctx.brand.slug} products={kit.products} welcome={kit.kind === "WELCOME"} />}
      {!account.tiktok && <TiktokAsk marca={ctx.brand.slug} />}
      <HomeView s={summary} base={base} ugc={ctx.ugcOnly} coupons={{ list: coupons, origin: `${proto}://${host}`, brandName: ctx.brand.name, deactivated: ctx.status === "DEACTIVATED" }} />
    </div>
  );
}
