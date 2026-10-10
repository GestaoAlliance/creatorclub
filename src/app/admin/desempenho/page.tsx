import { redirect } from "next/navigation";
import { brandsWith } from "@/lib/auth/permissions";
import { currentActor } from "@/lib/auth/current";
import { monthPerformance } from "@/lib/creators/performance";
import { db } from "@/lib/db";
import { staffContext } from "@/lib/staff/context";
import { ui } from "@/components/ui/styles";
import type { PerformanceSort } from "@/domain";
import { DesempenhoView, type Search } from "./view";

export const dynamic = "force-dynamic";

const SORTS: PerformanceSort[] = ["vendas", "minimo", "nome"];

// Desempenho do mês (U4, D-PERFORMANCE): ranking e acompanhamento das creators. Gestão e super admin.
export default async function DesempenhoPage({ searchParams }: { searchParams: Promise<Search> }) {
  const actor = await currentActor();
  if (!actor) redirect("/entrar?next=/admin/desempenho");
  const allowed = brandsWith(actor.grants, "creators.edit");
  if (allowed !== "ALL" && allowed.length === 0) redirect("/admin");
  const { brand } = await staffContext(actor);
  if (!brand) return <p className={ui.muted}>Nenhuma marca.</p>;
  const sp = await searchParams;
  const sort = SORTS.find((s) => s === sp.ordem) ?? "vendas";
  const data = await monthPerformance(db(), actor, brand.id, { month: sp.mes, sort });
  return <DesempenhoView data={data} sp={{ ...sp, ordem: sort }} />;
}
