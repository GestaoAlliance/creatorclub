import Link from "next/link";
import { redirect } from "next/navigation";
import { CopyButton } from "@/components/portal/copy-button";
import { PageHeader } from "@/components/ui/page";
import { WhatsAppIcon } from "@/components/ui/social-icons";
import { badge, ui } from "@/components/ui/styles";
import { ACTION_LABEL, type ActionKind } from "@/domain";
import { actionQueue, visibleTasks } from "@/lib/actions/queue";
import { can } from "@/lib/auth/permissions";
import { currentActor } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { staffContext } from "@/lib/staff/context";
import { DoneButton } from "./done";

export const dynamic = "force-dynamic";

const KINDS: ActionKind[] = ["ACCESS", "IDLE", "NEAR_MIN", "CONTRACT", "KIT_PENDING", "SHIP_STUCK", "BIRTHDAY", "NO_POST"];
const TONE: Record<ActionKind, string> = { IDLE: badge.red, NEAR_MIN: badge.green, CONTRACT: badge.amber, KIT_PENDING: badge.sky, SHIP_STUCK: badge.neutral, BIRTHDAY: badge.green, NO_POST: badge.amber, ACCESS: badge.sky };
const OWNER = { GESTAO: "Gestão", ENVIO: "Envio" } as const;

// Fila de ações por creator (M2.1, D-ACTIONS): o que a equipe precisa fazer hoje, com a mensagem pronta no WhatsApp.
export default async function ActionsPage({ searchParams }: { searchParams: Promise<{ tipo?: string }> }) {
  const actor = await currentActor();
  if (!actor) redirect("/entrar?next=/admin/creators/acoes");
  const { brand } = await staffContext(actor);
  if (!brand) return <p className={ui.muted}>Nenhuma marca.</p>;
  if (!can(actor.grants, "creators.edit", brand.id)) redirect("/conta");
  const { tipo } = await searchParams;
  const all = visibleTasks(await actionQueue(db(), brand.id), actor, brand.id);
  const kind = KINDS.find((k) => k === tipo);
  const tasks = kind ? all.filter((t) => t.kind === kind) : all;

  return (
    <>
      <PageHeader title="Ações">
        {all.length === 0
          ? `Nada pendente na ${brand.name} agora.`
          : `${all.length} ${all.length === 1 ? "tarefa" : "tarefas"} na ${brand.name}. Mande a mensagem pelo WhatsApp e marque como feito; quando o motivo se resolve (ela vendeu, renovou, escolheu o kit), a tarefa some sozinha.`}
      </PageHeader>
      <nav aria-label="Tipo" className="flex flex-wrap gap-2">
        <Link href="/admin/creators/acoes" className={!kind ? ui.pillOn : ui.pill}>Todas ({all.length})</Link>
        {KINDS.map((k) => {
          const n = all.filter((t) => t.kind === k).length;
          return n || kind === k ? (
            <Link key={k} href={`/admin/creators/acoes?tipo=${k}`} className={kind === k ? ui.pillOn : ui.pill}>
              {ACTION_LABEL[k]} ({n})
            </Link>
          ) : null;
        })}
      </nav>
      {tasks.length === 0 ? (
        <p className={ui.muted}>Nenhuma tarefa aqui.</p>
      ) : (
        <ul className={`${ui.card} divide-y divide-stone-200/70 !gap-0 !py-1 dark:divide-white/10`}>
          {tasks.map((t) => (
            <li key={t.key} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2">
                  <Link href={`/admin/creators/${t.creatorId}`} className="font-medium hover:underline">{t.name}</Link>
                  <span className={TONE[t.kind]}>{ACTION_LABEL[t.kind]}</span>
                  <span className={ui.hint}>· {OWNER[t.owner]}</span>
                </p>
                <p className="text-sm text-stone-600 dark:text-stone-400">{t.detail}</p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                {t.whatsappUrl ? (
                  <a href={t.whatsappUrl} target="_blank" rel="noopener noreferrer" className={`${ui.btnSm} !bg-emerald-600`}>
                    <WhatsAppIcon className="size-3.5" /> Mandar no WhatsApp
                  </a>
                ) : t.kind === "ACCESS" ? (
                  <Link href={`/admin/creators/${t.creatorId}#convite`} className={ui.btnSm}>Gerar o convite</Link>
                ) : (
                  t.message && <CopyButton value={t.message} label="Copiar mensagem (sem WhatsApp)" />
                )}
                <DoneButton taskKey={t.key} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
