import { PostForm, PostList } from "@/components/posts";
import { ui } from "@/components/ui/styles";
import { dayKey } from "@/domain";
import { db } from "@/lib/db";
import { currentPortalContext } from "@/lib/portal/current";
import { myPosts, postCampaignOptions } from "@/lib/posts/posts";

export const dynamic = "force-dynamic";

// Meus posts (M4.6, D-POSTS): link e dia de cada post, com as vendas que vieram depois.
export default async function PortalPosts({ params }: { params: Promise<{ marca: string }> }) {
  const { marca } = await params;
  const ctx = await currentPortalContext(marca);
  const [posts, campaigns] = await Promise.all([myPosts(db(), ctx), postCampaignOptions(db(), ctx.creatorId)]);
  return (
    <>
      <h1 className="text-xl font-semibold tracking-tight">Meus posts</h1>
      <p className={ui.muted}>Postou falando da {ctx.brand.name}? Cole o link aqui. Em 3 dias você vê quanto vendeu com o seu cupom depois do post.</p>
      {!ctx.viewAs && (
        <section className={ui.card}>
          <PostForm marca={ctx.brand.slug} today={dayKey(new Date())} campaigns={campaigns} />
        </section>
      )}
      <section className={ui.card}>
        <PostList posts={posts} canRemove={!ctx.viewAs} marca={ctx.brand.slug} />
      </section>
    </>
  );
}
