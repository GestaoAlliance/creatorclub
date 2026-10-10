import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { brandsWith } from "@/lib/auth/permissions";
import { currentActor } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { hunterPanel } from "@/lib/onboarding/hunters";
import { HuntersView } from "./view";

export const dynamic = "force-dynamic";

// Hunters (D-HUNTERLINK): link de cada hunter para os formulários, cliques e candidatas que cada um trouxe.
export default async function HuntersPage() {
  const actor = await currentActor();
  if (!actor) redirect("/entrar?next=/admin/hunters");
  const allowed = brandsWith(actor.grants, "creators.edit");
  if (allowed !== "ALL" && allowed.length === 0) redirect("/conta");
  const brands = await hunterPanel(db(), actor);
  const h = await headers();
  return <HuntersView brands={brands} origin={`${h.get("x-forwarded-proto") ?? "https"}://${h.get("host") ?? ""}`} />;
}
