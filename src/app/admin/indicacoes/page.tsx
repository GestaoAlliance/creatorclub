import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { currentActor } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { myHunterPanel } from "@/lib/onboarding/hunters";
import { IndicacoesView } from "./view";

export const dynamic = "force-dynamic";

// Minhas indicações (U3, D-HUNTERVIEW): o link da hunter, cliques e as candidatas que ela trouxe.
export default async function IndicacoesPage() {
  const actor = await currentActor();
  if (!actor) redirect("/entrar?next=/admin/indicacoes");
  if (!actor.grants.some((g) => g.role === "HUNTER")) redirect("/admin");
  const links = await myHunterPanel(db(), actor);
  const h = await headers();
  return <IndicacoesView links={links} origin={`${h.get("x-forwarded-proto") ?? "https"}://${h.get("host") ?? ""}`} />;
}
