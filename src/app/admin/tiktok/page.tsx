import { redirect } from "next/navigation";
import { GlassLight } from "@/components/ui/glass-light";
import { can } from "@/lib/auth/permissions";
import { currentActor } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { staffContext } from "@/lib/staff/context";
import { tiktokList } from "@/lib/tiktok/list";
import { TikTokBoard } from "./board";

export const dynamic = "force-dynamic";

type Search = { shop?: string; quem?: string; q?: string };

// Lista do TikTok (D-TIKTOKLIST, pedido da Vanessa: login da Mafe). Só leitura: quem tem TikTok na marca escolhida no
// topo, para a Mafe chamar no WhatsApp. Sem vendas, saldo, CPF ou pagamentos.
export default async function TikTokPage({ searchParams }: { searchParams: Promise<Search> }) {
  const actor = await currentActor();
  if (!actor) redirect("/entrar?next=/admin/tiktok");
  const { brand } = await staffContext(actor);
  if (!brand || !can(actor.grants, "tiktok.view", brand.id)) redirect("/conta");
  const sp = await searchParams;
  const all = await tiktokList(db(), actor, brand.id);
  return (
    <GlassLight className="dash flex flex-col gap-4">
      <TikTokBoard
        rows={all.map((r) => ({ ...r, since: r.since.toISOString() }))}
        brandName={brand.name}
        initial={{ q: sp.q ?? "", shop: sp.shop === "1", who: sp.quem === "candidatas" ? "CANDIDATA" : sp.quem === "creators" ? "CREATOR" : "" }}
      />
    </GlassLight>
  );
}
