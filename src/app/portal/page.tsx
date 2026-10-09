import { redirect } from "next/navigation";
import { currentActor } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { portalHome } from "@/lib/portal/context";

export const dynamic = "force-dynamic";

// Entrada do portal: leva a creator para a marca dela.
export default async function PortalEntry() {
  const actor = await currentActor();
  if (!actor) redirect("/entrar?next=/portal");
  const slug = await portalHome(db(), actor);
  if (!slug) redirect("/conta");
  redirect(`/portal/${slug}`);
}
