import { redirect } from "next/navigation";
import { GlassLight } from "@/components/ui/glass-light";
import { dayKey } from "@/domain";
import { can } from "@/lib/auth/permissions";
import { currentActor } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { contentBoard } from "@/lib/posts/content";
import { staffContext } from "@/lib/staff/context";
import { ContentBoard } from "./board";

export const dynamic = "force-dynamic";

// Conteúdo (M4.6, D-POSTS; D-CONTENTBOARD): posts registrados + detectados no Instagram, com as vendas depois de cada um.
export default async function ConteudoPage() {
  const actor = await currentActor();
  if (!actor) redirect("/entrar?next=/admin/conteudo");
  const { brand } = await staffContext(actor);
  if (!brand || !can(actor.grants, "creators.view", brand.id)) redirect("/conta");
  const [board, b] = await Promise.all([
    contentBoard(db(), actor, brand.id),
    db().brand.findUniqueOrThrow({ where: { id: brand.id }, select: { whatsappInstance: true, timezone: true } }),
  ]);
  return (
    <GlassLight className="dash flex flex-col gap-4">
      <ContentBoard
        posts={board.posts}
        mentions={board.mentions}
        notPosted={board.notPosted}
        brandName={brand.name}
        today={dayKey(new Date(), b.timezone)}
        whatsappOn={b.whatsappInstance !== null}
        canSend={can(actor.grants, "creators.edit", brand.id)}
      />
    </GlassLight>
  );
}
