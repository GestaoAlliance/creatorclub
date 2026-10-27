import { redirect } from "next/navigation";
import { DashboardView } from "@/components/staff/dashboard-view";
import { StaffHomeView } from "@/components/staff/home-view";
import { can } from "@/lib/auth/permissions";
import { currentActor } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { scopedActor, staffContext } from "@/lib/staff/context";
import { dashPeriod, staffDashboard, type DashCategory } from "@/lib/staff/dashboard";
import { staffHome } from "@/lib/staff/home";
import { onlyTikTok } from "@/lib/staff/nav";

export const dynamic = "force-dynamic";

const CATEGORIES: DashCategory[] = ["INFLUENCER", "UGC", "PRESCRITOR"];

// Início dentro de uma marca (A1, D-ALLIANCE). Quem vê dinheiro: o dashboard (M0.0.4, modelo da referência) com o que
// está esperando por você em cima. Os outros papéis (Envio, Hunter): os cartões do que cada um tem para fazer.
export default async function BrandHomePage({ searchParams }: { searchParams: Promise<{ periodo?: string; de?: string; ate?: string; tipo?: string }> }) {
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
  const d = await staffDashboard(db(), brand.id, dashPeriod(sp, tz), category);
  return <DashboardView d={d} h={h} category={category} brandName={brand.name} />;
}
