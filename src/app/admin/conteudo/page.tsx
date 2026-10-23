import { Megaphone } from "lucide-react";
import { redirect } from "next/navigation";
import { PostList } from "@/components/posts";
import { Card, PageHeader } from "@/components/ui/page";
import { ui } from "@/components/ui/styles";
import { can } from "@/lib/auth/permissions";
import { currentActor } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { brandPosts } from "@/lib/posts/posts";
import { staffContext } from "@/lib/staff/context";

export const dynamic = "force-dynamic";

// Conteúdo (M4.6, D-POSTS): posts das creators da marca (60 dias) e os que mais venderam depois.
export default async function ConteudoPage() {
  const actor = await currentActor();
  if (!actor) redirect("/entrar?next=/admin/conteudo");
  const { brand } = await staffContext(actor);
  if (!brand || !can(actor.grants, "creators.view", brand.id)) redirect("/conta");
  const posts = await brandPosts(db(), actor, brand.id);
  const best = posts.filter((p) => p.complete && p.aboveCents > 0).sort((a, b) => b.aboveCents - a.aboveCents).slice(0, 5);
  const canEdit = can(actor.grants, "creators.edit", brand.id);
  return (
    <>
      <PageHeader title="Conteúdo">
        Posts registrados pelas creators da {brand.name} (e pela equipe) nos últimos 60 dias, com as vendas do cupom nos 3 dias a partir de cada
        post comparadas com o normal dos 14 dias antes.
      </PageHeader>
      {best.length > 0 && (
        <Card title="Os que mais venderam acima do normal" icon={<Megaphone className="size-4" />}>
          <PostList posts={best} showCreator canRemove={false} />
        </Card>
      )}
      <Card title={`Todos os posts (${posts.length})`}>
        {posts.length === 0 ? <p className={ui.muted}>Nenhum post registrado ainda. As creators registram em "Meus posts", no portal.</p> : <PostList posts={posts} showCreator canRemove={canEdit} />}
      </Card>
    </>
  );
}
