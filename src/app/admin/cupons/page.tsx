import { redirect } from "next/navigation";
import { GlassLight } from "@/components/ui/glass-light";
import { ui } from "@/components/ui/styles";
import { can } from "@/lib/auth/permissions";
import { currentActor } from "@/lib/auth/current";
import { couponBoard } from "@/lib/coupons/board";
import { db } from "@/lib/db";
import { scopedActor, staffContext } from "@/lib/staff/context";
import { CouponsBoard } from "./board";
import { PeriodPicker } from "@/components/staff/period-picker";
import { staffPeriod } from "@/lib/staff/period";
import { dayKey, nextDayKey, periodPhrase, pickPeriod, startOfLocalDay } from "@/domain";

export const dynamic = "force-dynamic";

// Conferência da Ana (E4.3): tipo do cupom, dona e taxa (D-COUPONTABS); com contexto, sugestão e atalhos (D-COUPONBOARD).
export default async function CuponsPage({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const actor = await currentActor();
  if (!actor) redirect("/entrar?next=/admin/cupons");
  // A1 (D-ALLIANCE): só a marca escolhida no topo.
  const { brand } = await staffContext(actor);
  if (!brand) return <p className={ui.muted}>Nenhuma marca.</p>;
  if (!can(actor.grants, "creators.edit", brand.id)) redirect("/conta");
  // D-PERIODPICK: vendas de cada cupom no período; as pendências (tipo, dona, taxa) aparecem todas.
  const { p } = await searchParams;
  const { timezone } = await db().brand.findUniqueOrThrow({ where: { id: brand.id }, select: { timezone: true } });
  const period = await staffPeriod(p ? { p } : {}, timezone);
  const today = dayKey(new Date(), timezone);
  const range = { gte: startOfLocalDay(period.from, timezone), lt: startOfLocalDay(nextDayKey(period.to), timezone) };
  const b = await couponBoard(db(), scopedActor(actor, brand.id), brand.id, new Date(), range);
  return (
    <GlassLight className="dash flex flex-col gap-4">
      <CouponsBoard rows={b.rows} creators={b.creators} progress={b.progress} withoutCoupon={b.withoutCoupon} brandName={brand.name} defaultRate={b.defaultRateBps} phrase={periodPhrase(pickPeriod(period.key ?? null, today))} picker={<PeriodPicker value={period.key ?? ""} today={today} tone="brand" />} />
    </GlassLight>
  );
}
