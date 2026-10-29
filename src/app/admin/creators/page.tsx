import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui/page";
import { ui } from "@/components/ui/styles";
import { can } from "@/lib/auth/permissions";
import { currentActor } from "@/lib/auth/current";
import { parseCategoryFilter } from "@/domain";
import { db } from "@/lib/db";
import { listCreators, STATUS_LABEL } from "@/lib/creators/profile";
import { scopedActor, staffContext } from "@/lib/staff/context";
import { CreatorList } from "./list";

export const dynamic = "force-dynamic";

export default async function CreatorsPage({ searchParams }: { searchParams: Promise<{ portal?: string; contrato?: string; semvenda?: string; categoria?: string; pendencia?: string; tag?: string; arquivadas?: string; origem?: string }> }) {
  const actor = await currentActor();
  if (!actor) redirect("/entrar?next=/admin/creators");
  // A1 (D-ALLIANCE): só a marca escolhida no topo.
  const { brand } = await staffContext(actor);
  if (!brand) return <p className={ui.muted}>Nenhuma marca.</p>;
  if (!can(actor.grants, "creators.view", brand.id)) redirect("/conta");
  const { portal, contrato, semvenda, categoria, pendencia, tag, arquivadas, origem } = await searchParams;
  const archived = arquivadas === "1";
  const [creators, pendingApplications, archivedCount] = await Promise.all([
    listCreators(db(), scopedActor(actor, brand.id), brand.id, archived),
    db().creatorApplication.count({ where: { brandId: brand.id, status: "NEW" } }),
    db().creator.count({ where: { brandId: brand.id, archivedAt: { not: null } } }),
  ]);
  const active = creators.filter((c) => c.status === "ACTIVE").length;

  return (
    <>
      <PageHeader title={archived ? "Creators arquivadas" : "Creators"}>
        {archived ? (
          <>{creators.length} arquivadas na {brand.name}. Abra a ficha para desarquivar. <Link href="/admin/creators" className={ui.link}>Voltar para as creators</Link></>
        ) : (
          <>{creators.length} creators na {brand.name} · {active} ativas. Toque no nome para abrir a ficha.{archivedCount > 0 && <> <Link href="/admin/creators?arquivadas=1" className={ui.link}>Ver arquivadas ({archivedCount})</Link></>}</>
        )}
      </PageHeader>
      {can(actor.grants, "creators.edit", brand.id) && (
        <Link href="/admin/creators/revisar" className={`${ui.link} self-start text-sm`}>
          Cadastros a revisar (nome errado ou repetido) →
        </Link>
      )}
      {portal && (
        <p role="status" className="rounded-2xl border border-amber-400/60 bg-amber-100/80 px-4 py-3 text-sm text-amber-950 dark:bg-amber-900/40 dark:text-amber-100">
          O portal é de cada creator. Para ver como ela vê, abra a creator abaixo e toque em &quot;Ver o portal como esta creator&quot;. A
          visualização vale só neste aparelho, por 1 hora.
        </p>
      )}
      <CreatorList {...(tag ? { tag } : {})} {...(origem ? { origin: origem } : {})} rows={creators.map((c) => ({ ...c, statusLabel: STATUS_LABEL[c.status] }))} contractsOnly={contrato === "1"} idleOnly={semvenda === "1"} category={parseCategoryFilter(categoria)} pendingOnly={pendencia === "1"} pendingApplications={pendingApplications} canInvite={can(actor.grants, "creators.edit", brand.id)} />
    </>
  );
}
