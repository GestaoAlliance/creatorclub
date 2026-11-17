import { redirect } from "next/navigation";
import { GlassLight } from "@/components/ui/glass-light";
import { ui } from "@/components/ui/styles";
import { can } from "@/lib/auth/permissions";
import { currentActor } from "@/lib/auth/current";
import { parseCategoryFilter } from "@/domain";
import { db } from "@/lib/db";
import { listCreators, STATUS_LABEL } from "@/lib/creators/profile";
import { scopedActor, staffContext } from "@/lib/staff/context";
import { CreatorList, type ListInit } from "./list";
import { staffPeriod } from "@/lib/staff/period";
import { dayKey, periodPhrase, pickPeriod } from "@/domain";

export const dynamic = "force-dynamic";

type Params = { p?: string; portal?: string; contrato?: string; semvenda?: string; categoria?: string; pendencia?: string; tag?: string; arquivadas?: string; origem?: string; q?: string; situacao?: string; filtro?: string; uf?: string; ordem?: string };

export default async function CreatorsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const actor = await currentActor();
  if (!actor) redirect("/entrar?next=/admin/creators");
  // A1 (D-ALLIANCE): só a marca escolhida no topo.
  const { brand } = await staffContext(actor);
  if (!brand) return <p className={ui.muted}>Nenhuma marca.</p>;
  if (!can(actor.grants, "creators.view", brand.id)) redirect("/conta");
  const sp = await searchParams;
  const archived = sp.arquivadas === "1";
  // D-PERIODPICK: vendas e comissão de cada uma no período escolhido (o mesmo das outras telas).
  const { timezone } = await db().brand.findUniqueOrThrow({ where: { id: brand.id }, select: { timezone: true } });
  const period = await staffPeriod(sp.p ? { p: sp.p } : {}, timezone);
  const today = dayKey(new Date(), timezone);
  const picked = pickPeriod(period.key ?? null, today);
  const [creators, pendingApplications, archivedCount] = await Promise.all([
    listCreators(db(), scopedActor(actor, brand.id), brand.id, archived, period),
    db().creatorApplication.count({ where: { brandId: brand.id, status: "NEW" } }),
    db().creator.count({ where: { brandId: brand.id, archivedAt: { not: null } } }),
  ]);
  const canEdit = can(actor.grants, "creators.edit", brand.id);
  // Links antigos (Início, avisos) continuam abrindo já filtrados.
  const segment = sp.filtro ?? (sp.contrato === "1" ? "contrato" : sp.semvenda === "1" ? "semvenda" : sp.pendencia === "1" ? "pendencia" : undefined);
  const init: ListInit = {
    ...(sp.q ? { q: sp.q } : {}),
    ...(sp.situacao ? { situation: sp.situacao } : {}),
    ...(segment ? { segment } : {}),
    category: parseCategoryFilter(sp.categoria),
    ...(sp.tag ? { tag: sp.tag } : {}),
    ...(sp.origem ? { origin: sp.origem } : {}),
    ...(sp.uf ? { uf: sp.uf } : {}),
    ...(sp.ordem ? { sort: sp.ordem } : {}),
  };

  return (
    <GlassLight className="dash flex flex-col gap-4">
      {sp.portal && (
        <p role="status" className="rounded-2xl border border-amber-400/60 bg-amber-100/80 px-4 py-3 text-sm text-amber-950 dark:bg-amber-900/40 dark:text-amber-100">
          O portal é de cada creator. Para ver como ela vê, abra a creator abaixo e toque em &quot;Ver o portal como esta creator&quot;. A
          visualização vale só neste aparelho, por 1 hora.
        </p>
      )}
      <CreatorList
        period={{ key: period.key ?? "", label: picked.label, phrase: periodPhrase(picked), today }}
        rows={creators.map((c) => ({ ...c, statusLabel: STATUS_LABEL[c.status] }))}
        init={init}
        brand={{ name: brand.name, slug: brand.slug }}
        pendingApplications={pendingApplications}
        canEdit={canEdit}
        canReview={canEdit}
        archived={archived}
        archivedCount={archivedCount}
      />
    </GlassLight>
  );
}
