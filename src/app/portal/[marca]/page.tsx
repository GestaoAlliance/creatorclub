import { headers } from "next/headers";
import { publicOrigin } from "@/lib/site";
import { HomeView } from "@/components/portal/home-view";
import { KitBanner } from "@/components/portal/kit-banner";
import { BirthdayAsk } from "@/components/portal/birthday-ask";
import { TiktokAsk } from "@/components/portal/tiktok-ask";
import { InstallCard, InstallModal } from "@/components/portal/install-app";
import { db } from "@/lib/db";
import { currentPortalContext } from "@/lib/portal/current";
import { portalCoupons } from "@/lib/portal/coupons";
import { portalSummary } from "@/lib/portal/home";
import { portalCampaigns } from "@/lib/campaigns/campaigns";
import Link from "next/link";
import { Megaphone, Trophy } from "lucide-react";

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
    db().creator.findUniqueOrThrow({ where: { id: ctx.creatorId }, select: { account: { select: { tiktok: true, birthDate: true } } } }).then((c) => c.account),
    portalCoupons(db(), ctx),
  ]);
  // M4.5 (D-CAMPAIGN): campanha aberta (em breve ou acontecendo) aparece no Início.
  const open = (await portalCampaigns(db(), ctx)).filter((c) => c.phase === "SOON" || c.phase === "RUNNING");
  // D-DOMAIN: o link sai sempre com o domínio do site (APP_URL).
  const origin = publicOrigin(await headers());
  return (
    <div className="flex flex-col gap-6">
      {kit && <KitBanner base={base} brandSlug={ctx.brand.slug} products={kit.products} welcome={kit.kind === "WELCOME"} />}
      {/* D-INSTALLAPP: portal na tela de início (cartão até ela fechar; aviso uma vez, depois do tutorial). */}
      {!ctx.viewAs && <InstallCard brandName={ctx.brand.name} base={base} />}
      {!ctx.viewAs && <InstallModal brandName={ctx.brand.name} base={base} />}
      {!account.tiktok && <TiktokAsk marca={ctx.brand.slug} />}
      {/* M4.2 (D-TAGS): aniversário, enquanto não informado. */}
      {open.length > 0 && (
        <Link href={`${base}/campanhas`} className="glass flex items-center gap-3 rounded-3xl p-4 hover:shadow-sm md:p-5">
          <span className="grid size-9 shrink-0 place-content-center rounded-2xl bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"><Trophy className="size-4" /></span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">{open.length === 1 ? open[0]!.name : `${open.length} campanhas abertas`}</span>
            <span className="text-sm text-stone-600 dark:text-stone-300">{open.some((c) => c.canJoin) ? "Veja os prêmios e participe →" : "Veja o seu lugar no placar →"}</span>
          </span>
        </Link>
      )}
      {/* M4.6 (D-POSTS): atalho para registrar o post. */}
      <Link href={`${base}/posts`} className="glass flex items-center gap-3 rounded-3xl p-4 hover:shadow-sm md:p-5">
        <span className="grid size-9 shrink-0 place-content-center rounded-2xl bg-brand/10 text-brand dark:bg-brand-2/15 dark:text-brand-2"><Megaphone className="size-4" /></span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">Postou? Registre o link</span>
          <span className="text-sm text-stone-600 dark:text-stone-300">Veja quanto vendeu depois de cada post →</span>
        </span>
      </Link>
      {!account.birthDate && <BirthdayAsk marca={ctx.brand.slug} brandName={ctx.brand.name} />}
      <HomeView s={summary} base={base} ugc={ctx.ugcOnly} coupons={{ list: coupons, origin, brandName: ctx.brand.name, deactivated: ctx.status === "DEACTIVATED" }} />
    </div>
  );
}
