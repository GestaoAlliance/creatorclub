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
import Link from "next/link";
import { OverviewCards } from "@/components/staff/dashboard-view";
import { staffDashboard } from "@/lib/staff/dashboard";
import { baseHealth } from "@/lib/staff/insights";
import { productReport } from "@/lib/reports/products";

export const dynamic = "force-dynamic";

// Desempenho (D-PERFBOARD): Instagram, UGC e Origem. Gestão, Leitura e super admin (`performance.view`).
export default async function DesempenhoPage({ searchParams }: { searchParams: Promise<{ aba?: string; p?: string }> }) {
  const actor = await currentActor();
  if (!actor) redirect("/entrar?next=/admin/desempenho");
  const allowed = brandsWith(actor.grants, "performance.view");
  if (allowed !== "ALL" && allowed.length === 0) redirect("/admin");
  const { brand } = await staffContext(actor);
  if (!brand) return <p className={ui.muted}>Nenhuma marca.</p>;
  if (!can(actor.grants, "performance.view", brand.id)) redirect("/admin");
  const sp = await searchParams;
  const now = new Date();
  const tz = (await db().brand.findUniqueOrThrow({ where: { id: brand.id }, select: { timezone: true } })).timezone;
  // D-PERIODPICK: vendas e entradas no período escolhido; Instagram e o ciclo da UGC continuam como estão hoje.
  const period = await staffPeriod(sp.p ? { p: sp.p } : {}, tz, now);
  const today = dayKey(now, tz);
  const range = { gte: startOfLocalDay(period.from, tz), lt: startOfLocalDay(nextDayKey(period.to), tz) };
  const sales = await monthSalesByCreator(db(), brand.id, tz, now, range);
  const [ig, ugc, origin] = await Promise.all([instagramRanking(db(), actor, brand.id, sales, now), ugcBoard(db(), actor, brand.id, sales, now), originSummary(db(), actor, brand.id, sales, range)]);
  const initial = sp.aba === "ugc" || sp.aba === "origem" ? sp.aba : "instagram";
  // D-HOMESIMPLE: o que saiu do Início (saúde da base, retorno, movimentos, tops) fica em "Visão geral".
  const money = can(actor.grants, "money.view", brand.id);
  const geral = money ? await (async () => {
    const [d, health, products] = await Promise.all([
      staffDashboard(db(), brand.id, period, ""),
      baseHealth(db(), brand.id, "", range),
      productReport(db(), brand.id, period, "creators"),
    ]);
    return { d, health, products };
  })() : null;
  const base = `/admin/desempenho${period.key ? `?p=${encodeURIComponent(period.key)}&` : "?"}`;
  if (sp.aba === "geral" && geral) {
    return (
      <GlassLight className="dash flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-xl font-semibold tracking-tight">Visão geral · {periodPhrase(pickPeriod(period.key ?? null, today))}</h1>
          <span className="flex flex-wrap items-center gap-2">
            <PeriodPicker value={period.key ?? ""} today={today} />
            <Link href={`${base}aba=instagram`} className={ui.ghostSm}>Instagram, UGC e origem →</Link>
          </span>
        </div>
        <OverviewCards d={geral.d} health={geral.health} program={geral.products.program} productsWithoutCost={geral.products.productsTotal - geral.products.productsWithCost} />
      </GlassLight>
    );
  }
  return (
    <GlassLight className="dash flex flex-col gap-4">
      {geral && <Link href={`${base}aba=geral`} className={`${ui.ghostSm} self-end`}>Visão geral do período (saúde da base, retorno, movimentos, tops) →</Link>}
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
