import { redirect } from "next/navigation";
import { can } from "@/lib/auth/permissions";
import { currentActor } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { couponReview } from "@/lib/coupons/review";
import { scopedActor, staffContext } from "@/lib/staff/context";
import { Card, Kpi, PageHeader } from "@/components/ui/page";
import { ui } from "@/components/ui/styles";
import { CouponsBoard } from "./board";

export const dynamic = "force-dynamic";

// Conferência da Ana (E4.3): tipo do cupom, dona e taxa, separados em abas (D-COUPONTABS).
export default async function CuponsPage() {
  const actor = await currentActor();
  if (!actor) redirect("/entrar?next=/admin/cupons");
  // A1 (D-ALLIANCE): só a marca escolhida no topo.
  const { brand } = await staffContext(actor);
  if (!brand) return <p className={ui.muted}>Nenhuma marca.</p>;
  if (!can(actor.grants, "creators.edit", brand.id)) redirect("/conta");
  const { rows, creators, progress } = await couponReview(db(), scopedActor(actor, brand.id), brand.id);

  return (
    <>
      <PageHeader title="Cupons">
        Tipo do cupom, dona e taxa. Cupom sem tipo ou com dona a confirmar deixa os pedidos dele pendentes; PROMO nunca leva pedido.
      </PageHeader>
      <Card help="cp-resumo">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
          <Kpi label="Creators confirmadas" value={`${progress.confirmed} de ${progress.activeCreators}`} hint="cupom, dona e taxa" />
          <Kpi label="Cupons de creator" value={rows.filter((r) => r.kind === "CREATOR").length} />
          <Kpi label="Promocionais" value={rows.filter((r) => r.kind === "PROMO").length} />
        </div>
      </Card>
      <CouponsBoard rows={rows} creators={creators} />
    </>
  );
}
