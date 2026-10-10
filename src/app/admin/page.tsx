import { redirect } from "next/navigation";
import { StaffHomeView } from "@/components/staff/home-view";
import { currentActor } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { staffHome } from "@/lib/staff/home";

export const dynamic = "force-dynamic";

// Início da equipe (D-DESIGNALL): o que cada papel tem para fazer agora.
export default async function StaffHomePage() {
  const actor = await currentActor();
  if (!actor) redirect("/entrar?next=/admin");
  if (actor.grants.length === 0) redirect("/conta");
  return <StaffHomeView h={await staffHome(db(), actor)} />;
}
