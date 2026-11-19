import { redirect } from "next/navigation";
import { GlassLight } from "@/components/ui/glass-light";
import { ui } from "@/components/ui/styles";
import { dayKey, nextDayKey, periodPhrase, pickPeriod, startOfLocalDay } from "@/domain";
import { PeriodPicker } from "@/components/staff/period-picker";
import { staffPeriod } from "@/lib/staff/period";
import { brandsWith, can } from "@/lib/auth/permissions";
import { currentActor } from "@/lib/auth/current";
import { originSummary } from "@/lib/creators/origin";
import { db } from "@/lib/db";
import { instagramRanking } from "@/lib/instagram/ranking";
import { monthSalesByCreator, ugcBoard } from "@/lib/performance/board";
import { staffContext } from "@/lib/staff/context";
import { PerformanceBoard } from "./board";

export const dynamic = "force-dynamic";

// Redes e origem (D-PERFBOARD, D-SALESRANK): Instagram, UGC e Origem. Gestão, Leitura e super admin (`performance.view`).
export default async function DesempenhoPage({ searchParams }: { searchParams: Promise<{ aba?: string; p?: string }> }) {
  const actor = await currentActor();
  if (!actor) redirect("/entrar?next=/admin/desempenho");
  const allowed = brandsWith(actor.grants, "performance.view");
  if (allowed !== "ALL" && allowed.length === 0) redirect("/admin");
  const { brand } = await staffContext(actor);
  if (!brand) return <p className={ui.muted}>Nenhuma marca.</p>;
  if (!can(actor.grants, "performance.view", brand.id)) redirect("/admin");
  const sp = await searchParams;
  // D-SALESRANK: a visão geral (saúde, movimentos, retorno, tops) foi para Vendas.
  if (sp.aba === "geral") redirect(`/admin/vendas${sp.p ? `?p=${encodeURIComponent(sp.p)}` : ""}`);
  const now = new Date();
  const tz = (await db().brand.findUniqueOrThrow({ where: { id: brand.id }, select: { timezone: true } })).timezone;
  // D-PERIODPICK: vendas e entradas no período escolhido; Instagram e o ciclo da UGC continuam como estão hoje.
  const period = await staffPeriod(sp.p ? { p: sp.p } : {}, tz, now);
  const today = dayKey(now, tz);
  const range = { gte: startOfLocalDay(period.from, tz), lt: startOfLocalDay(nextDayKey(period.to), tz) };
  const sales = await monthSalesByCreator(db(), brand.id, tz, now, range);
  const [ig, ugc, origin] = await Promise.all([instagramRanking(db(), actor, brand.id, sales, now), ugcBoard(db(), actor, brand.id, sales, now), originSummary(db(), actor, brand.id, sales, range)]);
  const initial = sp.aba === "ugc" || sp.aba === "origem" ? sp.aba : "instagram";
  return (
    <GlassLight className="dash flex flex-col gap-4">
      <PerformanceBoard
        brandName={brand.name}
        phrase={periodPhrase(pickPeriod(period.key ?? null, today))}
        picker={<PeriodPicker value={period.key ?? ""} today={today} tone="brand" />}
        ig={ig}
        ugc={ugc}
        origin={origin}
        initial={initial}
        now={now}
        canEdit={can(actor.grants, "creators.edit", brand.id)}
      />
    </GlassLight>
  );
}
