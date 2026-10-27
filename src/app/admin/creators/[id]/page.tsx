import { notFound, redirect } from "next/navigation";
import { randomUUID } from "node:crypto";
import { currentActor } from "@/lib/auth/current";
import { creatorStatement, StatementError } from "@/lib/commission/statement";
import { creatorProfile, ProfileError } from "@/lib/creators/profile";
import { creatorReturns } from "@/lib/reports/creator-return";
import { db } from "@/lib/db";
import { creatorTermsStatus } from "@/lib/terms/terms";
import { creatorContractSignature } from "@/lib/contracts/sign";
import { staffContext } from "@/lib/staff/context";
import { OtherBrandNotice } from "@/components/staff/other-brand";
import { headers } from "next/headers";
import { publicOrigin } from "@/lib/site";
import { creatorNumbers, creatorTimeline } from "@/lib/creators/timeline";
import { brandTags } from "@/lib/creators/tags";
import { creatorPosts, postCampaignOptions } from "@/lib/posts/posts";
import { dayKey } from "@/domain";
import { CreatorProfileView } from "./view";

export const dynamic = "force-dynamic";

// Ficha da creator (E4.4), no visual do sistema (D-DESIGNALL).
export default async function CreatorPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ mes?: string }> }) {
  const { id } = await params;
  const { mes } = await searchParams;
  const actor = await currentActor();
  if (!actor) redirect(`/entrar?next=/admin/creators/${id}`);
  let p;
  try {
    p = await creatorProfile(db(), actor, id);
  } catch (error) {
    if (error instanceof ProfileError) notFound();
    throw error;
  }
  // A1 (D-ALLIANCE): a ficha só abre dentro da marca da creator.
  const { brand } = await staffContext(actor);
  if (brand && brand.id !== p.brandId) {
    const own = await db().brand.findUniqueOrThrow({ where: { id: p.brandId }, select: { slug: true, name: true } });
    return <OtherBrandNotice title="Creator" brand={own} next={`/admin/creators/${id}`} />;
  }
  let st = null;
  if (p.adjustments) {
    try {
      st = await creatorStatement(db(), actor, id, mes ? { month: mes } : {});
    } catch (error) {
      if (!(error instanceof StatementError)) throw error;
      st = await creatorStatement(db(), actor, id);
    }
  }

  const RETURN_DAYS = 90;
  const [terms, contract, numbers, timeline, own, ret, tags, posts, postCampaigns] = await Promise.all([
    creatorTermsStatus(db(), p.id, p.brandId),
    creatorContractSignature(db(), p.id),
    // M0.2: números de 30 dias, aguardando pagamento e estornos (só quem vê dinheiro) e a linha do tempo.
    p.adjustments ? creatorNumbers(db(), p.id) : Promise.resolve(null),
    creatorTimeline(db(), actor, p.id),
    db().brand.findUniqueOrThrow({ where: { id: p.brandId }, select: { slug: true } }),
    // M3.3 (D-RETURN): retorno dos últimos 90 dias (só quem vê dinheiro).
    p.adjustments
      ? creatorReturns(db(), p.brandId, { gte: new Date(Date.now() - RETURN_DAYS * 86_400_000), lt: new Date(Date.now() + 60_000) }, [p.id]).then((m) => m.get(p.id) ?? null)
      : Promise.resolve(null),
    // M4.2 (D-TAGS): tags da marca para sugerir.
    brandTags(db(), p.brandId),
    // M4.6 (D-POSTS): posts dela e as campanhas em que está inscrita.
    creatorPosts(db(), actor, p.id),
    postCampaignOptions(db(), p.id),
  ]);
  // Link rastreado que ela divulga (D-LINK), com o domínio desta requisição (o mesmo do portal).
  const h = await headers();
  const linkBase = `${publicOrigin(h)}/r/${own.slug}/`;
  return <CreatorProfileView p={p} st={st} terms={terms} contract={contract} requestId={randomUUID()} numbers={numbers} timeline={timeline} linkBase={linkBase} mes={mes} ret={ret} returnDays={RETURN_DAYS} tagSuggestions={tags.map((t) => t.name)} posts={posts} postCampaigns={postCampaigns} today={dayKey(new Date())} />;
}
