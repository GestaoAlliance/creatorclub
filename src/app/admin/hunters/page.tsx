import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { GlassLight } from "@/components/ui/glass-light";
import { can } from "@/lib/auth/permissions";
import { currentActor } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { hunterBoard } from "@/lib/onboarding/hunter-board";
import { publicOrigin } from "@/lib/site";
import { staffContext } from "@/lib/staff/context";
import { HuntersView, PERIODS } from "./view";

export const dynamic = "force-dynamic";

// Hunters (D-HUNTERLINK; D-HUNTERBOARD): ranking com o funil de cada hunter, link, telefone e quem está parado.
export default async function HuntersPage({ searchParams }: { searchParams: Promise<{ periodo?: string }> }) {
  const actor = await currentActor();
  if (!actor) redirect("/entrar?next=/admin/hunters");
  const { brand } = await staffContext(actor);
  if (!brand || !can(actor.grants, "creators.edit", brand.id)) redirect("/conta");
  const { periodo } = await searchParams;
  const period = PERIODS.find((p) => p.id === periodo) ?? PERIODS[0]!;
  const data = await hunterBoard(db(), actor, brand.id, period.days);
  const h = await headers();
  return (
    <GlassLight className="dash flex flex-col gap-4">
      <HuntersView data={data} brandId={brand.id} origin={publicOrigin(h)} period={period.id} />
    </GlassLight>
  );
}
