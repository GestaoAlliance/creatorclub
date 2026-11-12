import { Ideas, Insights, PostMonths, PostsHero, RegisterPost, TopPosts } from "@/components/portal/posts-view";
import { db } from "@/lib/db";
import { currentPortalContext } from "@/lib/portal/current";
import { portalPostsBoard } from "@/lib/portal/posts-board";
import { postCampaignOptions } from "@/lib/posts/posts";

export const dynamic = "force-dynamic";

// Meus posts (M4.6, D-POSTS; D-PORTALPOSTS): resumo do mês, registrar (colar e pronto), o que mais vende, campeões,
// ideias da semana e a lista por mês com a comissão e os pedidos depois de cada post (registrados e detectados).
export default async function PortalPosts({ params }: { params: Promise<{ marca: string }> }) {
  const { marca } = await params;
  const ctx = await currentPortalContext(marca);
  const [b, campaigns, brand] = await Promise.all([
    portalPostsBoard(db(), ctx),
    postCampaignOptions(db(), ctx.creatorId),
    db().brand.findUniqueOrThrow({ where: { id: ctx.brand.id }, select: { timezone: true } }),
  ]);
  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <PostsHero b={b} />
      {/* Visualização da equipe (D-VIEWAS): sem registrar nem tirar post. */}
      {!ctx.viewAs && <RegisterPost marca={ctx.brand.slug} brandName={ctx.brand.name} today={b.today} timeZone={brand.timezone} campaigns={campaigns} posts={b.posts} />}
      <div className="grid gap-4 md:grid-cols-2 md:gap-6">
        <Insights b={b} />
        <TopPosts top={b.top} />
      </div>
      <Ideas ideas={b.ideas} />
      <PostMonths posts={b.posts} marca={ctx.viewAs ? null : ctx.brand.slug} />
    </div>
  );
}
