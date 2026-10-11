import { redirect } from "next/navigation";
import { StaffHomeView } from "@/components/staff/home-view";
import { currentActor } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { scopedActor, staffContext } from "@/lib/staff/context";
import { staffHome } from "@/lib/staff/home";

export const dynamic = "force-dynamic";

// Início dentro de uma marca (A1, D-ALLIANCE): o que cada papel tem para fazer agora nela (D-DESIGNALL).
export default async function BrandHomePage() {
  const actor = await currentActor();
  if (!actor) redirect("/entrar?next=/admin/marca");
  if (actor.grants.length === 0) redirect("/conta");
  const { brand } = await staffContext(actor);
  return <StaffHomeView h={await staffHome(db(), scopedActor(actor, brand?.id))} />;
}
