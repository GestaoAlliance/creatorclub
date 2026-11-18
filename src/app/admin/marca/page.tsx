import { dayKey } from "@/domain";
import { redirect } from "next/navigation";
import { DashboardView } from "@/components/staff/dashboard-view";
import { StaffHomeView } from "@/components/staff/home-view";
import { can } from "@/lib/auth/permissions";
import { currentActor } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { scopedActor, staffContext } from "@/lib/staff/context";
import { staffDashboard, type DashCategory } from "@/lib/staff/dashboard";
import { staffPeriod } from "@/lib/staff/period";
import { staffHome } from "@/lib/staff/home";
import { cashflow } from "@/lib/staff/insights";
import { onlyTikTok } from "@/lib/staff/nav";

export const dynamic = "force-dynamic";

const CATEGORIES: DashCategory[] = ["INFLUENCER", "UGC", "PRESCRITOR"];

// Início dentro de uma marca (A1, D-ALLIANCE; D-HOMESIMPLE). Quem vê dinheiro: "O que fazer hoje" e, pelo papel, os
// números do mês (Gestão) ou a caixa (Pagamento). Os outros papéis (Envio, Hunter): os cartões do que cada um tem para fazer.
export default async function BrandHomePage({ searchParams }: { searchParams: Promise<{ p?: string; periodo?: string; de?: string; ate?: string; tipo?: string }> }) {
  const actor = await currentActor();
  if (!actor) redirect("/entrar?next=/admin/marca");
  if (actor.grants.length === 0) redirect("/conta");
  if (onlyTikTok(actor.grants)) redirect("/admin/tiktok");
  const { brand } = await staffContext(actor);
  const h = await staffHome(db(), scopedActor(actor, brand?.id));
  if (!brand || !can(actor.grants, "money.view", brand.id)) return <StaffHomeView h={h} />;
  const sp = await searchParams;
  const tz = (await db().brand.findUniqueOrThrow({ where: { id: brand.id }, select: { timezone: true } })).timezone;
  const category = CATEGORIES.find((c) => c === sp.tipo) ?? "";
  const period = await staffPeriod(sp, tz);
  // D-HOMESIMPLE: Gestão e super admin (editam creators) veem os números do mês; o Pagamento, a caixa das comissões.
  const role = can(actor.grants, "creators.edit", brand.id) ? "gestao" : "pagamento";
  const [d, cash] = await Promise.all([
    role === "gestao" ? staffDashboard(db(), brand.id, period, category) : Promise.resolve(null),
    role === "pagamento" && can(actor.grants, "withdrawals.view", brand.id) ? cashflow(db(), brand.id) : Promise.resolve(null),
  ]);
  return <DashboardView d={d} h={h} category={category} brandName={brand.name} cash={cash} role={role} periodKey={period.key ?? ""} today={dayKey(new Date(), tz)} />;
}
