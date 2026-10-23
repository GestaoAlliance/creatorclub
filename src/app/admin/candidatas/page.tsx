import { redirect } from "next/navigation";
import type { ApplicationFilters } from "@/domain";
import { brandsWith, can } from "@/lib/auth/permissions";
import { currentActor } from "@/lib/auth/current";
import { scopedActor, staffContext } from "@/lib/staff/context";
import { db } from "@/lib/db";
import { listApplications } from "@/lib/onboarding/applications";
import { CandidatasView, SORTS, TABS, type Search } from "./view";

export const dynamic = "force-dynamic";

// Candidatas (D-ONBOARD, D-CAPTACAO, D-SIGNUP): busca, filtros e lista compacta (F2); aprovar vira creator com cupom e convite.
export default async function CandidatasPage({ searchParams }: { searchParams: Promise<Search> }) {
  const actor = await currentActor();
  if (!actor) redirect("/entrar?next=/admin/candidatas");
  const allowed = brandsWith(actor.grants, "creators.view");
  if (allowed !== "ALL" && allowed.length === 0) redirect("/conta");
  const sp = await searchParams;
  const status = TABS.find(([s]) => s === sp.ver)?.[0] ?? "NEW";
  const filters: ApplicationFilters = {
    ...(sp.q ? { q: sp.q } : {}),
    ...(sp.tipo ? { kind: sp.tipo } : {}),
    ...(sp.origem ? { source: sp.origem } : {}),
    ...(sp.hunter ? { hunter: sp.hunter } : {}),
    ...(sp.marca ? { brand: sp.marca } : {}),
    sort: SORTS.find(([s]) => s === sp.ordem)?.[0] ?? "prioridade",
  };
  // A1 (D-ALLIANCE): só a marca escolhida no topo.
  const brand = (await staffContext(actor)).brand;
  const inBrand = scopedActor(actor, brand?.id);
  const data = await listApplications(db(), inBrand, status, filters);
  // M4.1 (D-MANUALAPP): "Nova candidata" para quem edita creators na marca do topo.
  return <CandidatasView status={status} sp={sp} filters={filters} data={data} canCreate={Boolean(brand && can(actor.grants, "creators.edit", brand.id))} />;
}
