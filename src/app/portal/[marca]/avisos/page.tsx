import { Channel, NoticeList, NoticesHero, Pinned } from "@/components/portal/notices-view";
import { db } from "@/lib/db";
import { markAllRead } from "@/lib/notifications/notify";
import { currentPortalContext } from "@/lib/portal/current";
import { portalNoticesBoard } from "@/lib/portal/notices-board";

export const dynamic = "force-dynamic";

// Avisos da creator (U5, D-NOTICES; D-PORTALNOTICES): o que pede ação agora, recados da equipe fixados até "Entendi",
// lista por dia e onde ela recebe. Abrir a página marca os outros avisos como lidos (menos a equipe vendo o portal).
export default async function AvisosPage({ params }: { params: Promise<{ marca: string }> }) {
  const { marca } = await params;
  const ctx = await currentPortalContext(marca);
  const b = await portalNoticesBoard(db(), ctx);
  await markAllRead(db(), ctx);
  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <NoticesHero b={b} />
      <Pinned b={b} marca={ctx.viewAs ? null : ctx.brand.slug} />
      <NoticeList b={b} />
      <Channel b={b} />
    </div>
  );
}
