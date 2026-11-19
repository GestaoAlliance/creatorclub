import { redirect } from "next/navigation";
import { GlassLight } from "@/components/ui/glass-light";
import { ui } from "@/components/ui/styles";
import { can } from "@/lib/auth/permissions";
import { currentActor } from "@/lib/auth/current";
import { couponBoard } from "@/lib/coupons/board";
import { db } from "@/lib/db";
import { scopedActor, staffContext } from "@/lib/staff/context";
import { CouponsBoard } from "./board";

export const dynamic = "force-dynamic";

// Conferência da Ana (E4.3; D-COUPONSIMPLE): a conferir no topo e uma lista só; vendas dos últimos 30 dias.
export default async function CuponsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const actor = await currentActor();
  if (!actor) redirect("/entrar?next=/admin/cupons");
  // A1 (D-ALLIANCE): só a marca escolhida no topo.
  const { brand } = await staffContext(actor);
  if (!brand) return <p className={ui.muted}>Nenhuma marca.</p>;
  if (!can(actor.grants, "creators.edit", brand.id)) redirect("/conta");
  const { q } = await searchParams;
  const b = await couponBoard(db(), scopedActor(actor, brand.id), brand.id, new Date());
  return (
    <GlassLight className="dash flex flex-col gap-4">
      <CouponsBoard rows={b.rows} creators={b.creators} brandName={brand.name} defaultRate={b.defaultRateBps} initialQuery={q ?? ""} />
    </GlassLight>
  );
}
