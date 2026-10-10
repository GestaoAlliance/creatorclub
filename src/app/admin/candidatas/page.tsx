import { redirect } from "next/navigation";
import type { ApplicationFilters } from "@/domain";
import { brandsWith } from "@/lib/auth/permissions";
import { currentActor } from "@/lib/auth/current";
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
    ...(sp.vf === "1" ? { vermefree: true } : {}),
    sort: SORTS.find(([s]) => s === sp.ordem)?.[0] ?? "antigas",
  };
  const data = await listApplications(db(), actor, status, filters);
  return <CandidatasView status={status} sp={sp} filters={filters} data={data} />;
}
