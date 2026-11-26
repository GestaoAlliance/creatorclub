import { notFound, redirect } from "next/navigation";
import { terminationView } from "@/lib/creators/termination";
import { withdrawBlocks } from "@/lib/payouts/withdraw-blocks";
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
import { dayKey, nextDayKey, startOfLocalDay } from "@/domain";
import { staffPeriod } from "@/lib/staff/period";
import { creatorPeriodSales } from "@/lib/sales/creator-period";
import { listSales } from "@/lib/sales/list";
import { creatorInstagram } from "@/lib/instagram/ranking";
import { brandHunters, canSeeOrigin, originsFor } from "@/lib/creators/origin";
import { creatorInsights } from "@/lib/creators/insights";
import { GlassLight } from "@/components/ui/glass-light";
import { CreatorProfileView } from "./view";

export const dynamic = "force-dynamic";

// Ficha da creator (E4.4), no visual do sistema (D-DESIGNALL).
export default async function CreatorPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ mes?: string; p?: string; periodo?: string; de?: string; ate?: string; aba?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const { mes } = sp;
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
  // D-DISTRATO: encerramento agendado ou processado.
  const termination = p.canEdit ? await terminationView(db(), id) : null;
  // D-CANTWITHDRAW: só para quem vê o dinheiro da ficha.
  const withdrawBlock = p.adjustments ? ((await withdrawBlocks(db(), p.brandId, new Date(), [id])).get(id) ?? null) : null;
  let st = null;
  if (p.adjustments) {
    try {
      st = await creatorStatement(db(), actor, id, mes ? { month: mes } : {});
    } catch (error) {
      if (!(error instanceof StatementError)) throw error;
      st = await creatorStatement(db(), actor, id);
    }
  }

  // D-PERIODPICK: o mesmo seletor de tempo das outras telas; vale para vendas, retorno, comparação e produtos.
  const own = await db().brand.findUniqueOrThrow({ where: { id: p.brandId }, select: { slug: true, timezone: true } });
  const period = await staffPeriod(sp, own.timezone);
  const range = { gte: startOfLocalDay(period.from, own.timezone), lt: startOfLocalDay(nextDayKey(period.to), own.timezone) };
  const [terms, contract, numbers, timeline, ret, tags, posts, postCampaigns, ig, origin, insights, periodSales, sales] = await Promise.all([
    creatorTermsStatus(db(), p.id, p.brandId),
    creatorContractSignature(db(), p.id),
    // M0.2: números de 30 dias, aguardando pagamento e estornos (só quem vê dinheiro) e a linha do tempo.
    p.adjustments ? creatorNumbers(db(), p.id) : Promise.resolve(null),
    creatorTimeline(db(), actor, p.id),
    // M3.3 (D-RETURN): retorno no período (só quem vê dinheiro).
    p.adjustments
      ? creatorReturns(db(), p.brandId, range, [p.id]).then((m) => m.get(p.id) ?? null)
      : Promise.resolve(null),
    // M4.2 (D-TAGS): tags da marca para sugerir.
    brandTags(db(), p.brandId),
    // M4.6 (D-POSTS): posts dela e as campanhas em que está inscrita.
    creatorPosts(db(), actor, p.id),
    postCampaignOptions(db(), p.id),
    // D-INSTAGRAM: quadro do Instagram (só quem vê o Desempenho).
    creatorInstagram(db(), actor, p.id),
    // D-ORIGIN: de onde veio (Gestão, Leitura e super admin) e os hunters para marcar à mão.
    canSeeOrigin(actor, p.brandId)
      ? Promise.all([originsFor(db(), [p.id]), brandHunters(db(), p.brandId)]).then(([m, hunters]) => ({ origin: m.get(p.id)!, hunters }))
      : Promise.resolve(null),
    // D-CREATORFILE: vendas por mês, produtos, comparação, último envio e a abertura.
    creatorInsights(db(), actor, p.id, new Date(), range),
    p.adjustments ? creatorPeriodSales(db(), p.id, period, own.timezone) : Promise.resolve(null),
    p.adjustments ? listSales(db(), p.brandId, { creatorId: p.id, from: period.from, to: period.to }, 1, 50) : Promise.resolve(null),
  ]);
  // Link rastreado que ela divulga (D-LINK), com o domínio desta requisição (o mesmo do portal).
  const h = await headers();
  const linkBase = `${publicOrigin(h)}/r/${own.slug}/`;
  return (
    <GlassLight className="dash flex flex-col gap-6">
      <CreatorProfileView p={p} st={st} terms={terms} contract={contract} requestId={randomUUID()} numbers={numbers} timeline={timeline} linkBase={linkBase} mes={mes} ret={ret} tagSuggestions={tags.map((t) => t.name)} posts={posts} postCampaigns={postCampaigns} ig={ig} origin={origin} insights={insights} termination={termination} withdrawBlock={withdrawBlock} today={dayKey(new Date())}
        period={{ key: period.key ?? "", today: dayKey(new Date(), own.timezone), sales: periodSales, orders: sales ? { total: sales.total, rows: sales.rows.map((o) => ({ ...o, createdAt: o.createdAt.toISOString(), paidAt: o.paidAt ? o.paidAt.toISOString() : null })) } : null }}
        initialTab={sp.aba === "vendas" ? "vendas" : undefined} />
    </GlassLight>
  );
}
