import { redirect } from "next/navigation";
import { AllianceView } from "@/components/staff/alliance-view";
import { currentActor } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { staffContext } from "@/lib/staff/context";
import { hasAlliancePanel } from "@/lib/staff/nav";
import { allianceOverview } from "@/lib/staff/overview";

export const dynamic = "force-dynamic";

// Painel da Alliance (A1, D-ALLIANCE): super admin ou quem atende mais de uma marca escolhe a marca aqui.
// Quem atende uma marca só vai direto para o Início dela.
export default async function StaffHomePage() {
  const actor = await currentActor();
  if (!actor) redirect("/entrar?next=/admin");
  if (actor.grants.length === 0) redirect("/conta");
  const ctx = await staffContext(actor);
  if (!hasAlliancePanel(actor.grants, ctx.brands.length)) redirect("/admin/marca");
  return <AllianceView brands={await allianceOverview(db(), actor, ctx.brands)} />;
}
