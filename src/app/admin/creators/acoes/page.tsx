import { redirect } from "next/navigation";
import { GlassLight } from "@/components/ui/glass-light";
import { ui } from "@/components/ui/styles";
import { actionQueue, actionsDoneToday, visibleTasks } from "@/lib/actions/queue";
import { can } from "@/lib/auth/permissions";
import { currentActor } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { staffContext } from "@/lib/staff/context";
import { ActionsBoard } from "./board";
import { LegacyContracts } from "./legacy";
import { legacyReview } from "@/lib/autentique/legacy-import";

export const dynamic = "force-dynamic";

// Fila de ações por creator (M2.1, D-ACTIONS; D-ACTIONSBOARD): por urgência, com o progresso do dia e a mensagem pronta.
export default async function ActionsPage() {
  const actor = await currentActor();
  if (!actor) redirect("/entrar?next=/admin/creators/acoes");
  const { brand } = await staffContext(actor);
  if (!brand) return <p className={ui.muted}>Nenhuma marca.</p>;
  if (!can(actor.grants, "creators.edit", brand.id) && !can(actor.grants, "shipping.manage", brand.id)) redirect("/conta");
  const canEdit = can(actor.grants, "creators.edit", brand.id);
  const [all, doneToday, b, legacy] = await Promise.all([
    actionQueue(db(), brand.id).then((t) => visibleTasks(t, actor, brand.id)),
    actionsDoneToday(db(), brand.id),
    db().brand.findUniqueOrThrow({ where: { id: brand.id }, select: { whatsappInstance: true } }),
    canEdit ? legacyReview(db(), brand.id) : null,
  ]);
  return (
    <GlassLight className="dash flex flex-col gap-4">
      {/* D-LEGACYCONTRACT: contratos assinados no Autentique antes do Creator Club. */}
      {legacy && (legacy.open.length > 0 || legacy.matched > 0) && <LegacyContracts open={legacy.open} creators={legacy.creators} attached={legacy.attached} />}
      <ActionsBoard tasks={all} doneToday={doneToday} brandName={brand.name} canSend={can(actor.grants, "creators.edit", brand.id)} whatsappOn={b.whatsappInstance !== null} />
    </GlassLight>
  );
}
