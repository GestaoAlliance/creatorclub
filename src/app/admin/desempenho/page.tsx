import { redirect } from "next/navigation";
import { GlassLight } from "@/components/ui/glass-light";
import { ui } from "@/components/ui/styles";
import { monthKey } from "@/domain";
import { brandsWith, can } from "@/lib/auth/permissions";
import { currentActor } from "@/lib/auth/current";
import { originSummary } from "@/lib/creators/origin";
import { db } from "@/lib/db";
import { instagramRanking } from "@/lib/instagram/ranking";
import { monthSalesByCreator, ugcBoard } from "@/lib/performance/board";
import { staffContext } from "@/lib/staff/context";
import { PerformanceBoard } from "./board";

export const dynamic = "force-dynamic";

const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

// Desempenho (D-PERFBOARD): Instagram, UGC e Origem. Gestão, Leitura e super admin (`performance.view`).
export default async function DesempenhoPage({ searchParams }: { searchParams: Promise<{ aba?: string }> }) {
  const actor = await currentActor();
  if (!actor) redirect("/entrar?next=/admin/desempenho");
  const allowed = brandsWith(actor.grants, "performance.view");
  if (allowed !== "ALL" && allowed.length === 0) redirect("/admin");
  const { brand } = await staffContext(actor);
  if (!brand) return <p className={ui.muted}>Nenhuma marca.</p>;
  const sp = await searchParams;
  const now = new Date();
  const tz = (await db().brand.findUniqueOrThrow({ where: { id: brand.id }, select: { timezone: true } })).timezone;
  const sales = await monthSalesByCreator(db(), brand.id, tz, now);
  const [ig, ugc, origin] = await Promise.all([instagramRanking(db(), actor, brand.id, sales, now), ugcBoard(db(), actor, brand.id, sales, now), originSummary(db(), actor, brand.id, sales)]);
  const month = monthKey(now, tz);
  const initial = sp.aba === "ugc" || sp.aba === "origem" ? sp.aba : "instagram";
  return (
    <GlassLight className="dash flex flex-col gap-4">
      <PerformanceBoard
        brandName={brand.name}
        monthLabel={`${MONTHS[Number(month.slice(5)) - 1]} de ${month.slice(0, 4)}`}
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
