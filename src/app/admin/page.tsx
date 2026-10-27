import { redirect } from "next/navigation";
import { AllianceDashboardView } from "@/components/staff/alliance-dashboard-view";
import { can } from "@/lib/auth/permissions";
import { currentActor } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { allianceDashboard } from "@/lib/staff/alliance-dashboard";
import { staffContext } from "@/lib/staff/context";
import { dashPeriod } from "@/lib/staff/dashboard";
import { hasAlliancePanel, onlyTikTok } from "@/lib/staff/nav";
import { allianceOverview } from "@/lib/staff/overview";

export const dynamic = "force-dynamic";

// "Todas as marcas" (M0.0.4, D-ALLBRANDS; antes o painel da Alliance, A1): super admin ou quem atende mais de uma marca.
// Números somados só das marcas em que a pessoa vê dinheiro; embaixo, o que cada marca tem esperando.
// Quem atende uma marca só vai direto para o Início dela.
export default async function StaffHomePage({ searchParams }: { searchParams: Promise<{ periodo?: string; de?: string; ate?: string }> }) {
  const actor = await currentActor();
  if (!actor) redirect("/entrar?next=/admin");
  if (actor.grants.length === 0) redirect("/conta");
  if (onlyTikTok(actor.grants)) redirect("/admin/tiktok");
  const ctx = await staffContext(actor);
  if (!hasAlliancePanel(actor.grants, ctx.brands.length)) redirect("/admin/marca");
  const money = ctx.brands.filter((b) => can(actor.grants, "money.view", b.id));
  const sp = await searchParams;
  const [d, cards] = await Promise.all([
    money.length ? allianceDashboard(db(), money, dashPeriod(sp, "America/Sao_Paulo")) : Promise.resolve(null),
    allianceOverview(db(), actor, ctx.brands),
  ]);
  return <AllianceDashboardView d={d} cards={cards} />;
}
