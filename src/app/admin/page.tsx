import { redirect } from "next/navigation";
import { AllianceView } from "@/components/staff/alliance-view";
import { StaffHomeView } from "@/components/staff/home-view";
import { currentActor } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { scopedActor, staffContext } from "@/lib/staff/context";
import { staffHome } from "@/lib/staff/home";
import { allianceOverview } from "@/lib/staff/overview";

export const dynamic = "force-dynamic";

// Início da equipe. Super admin ou quem atende mais de uma marca: visão geral da Alliance, um cartão por marca
// (A1, D-ALLIANCE). Quem atende uma marca só: o que o papel tem para fazer nela agora (D-DESIGNALL).
export default async function StaffHomePage() {
  const actor = await currentActor();
  if (!actor) redirect("/entrar?next=/admin");
  if (actor.grants.length === 0) redirect("/conta");
  const ctx = await staffContext(actor);
  const global = actor.grants.some((g) => g.brandId === null && g.role === "SUPER_ADMIN");
  if (global || ctx.brands.length > 1) return <AllianceView brands={await allianceOverview(db(), actor, ctx.brands)} />;
  return <StaffHomeView h={await staffHome(db(), scopedActor(actor, ctx.brand?.id))} />;
}
