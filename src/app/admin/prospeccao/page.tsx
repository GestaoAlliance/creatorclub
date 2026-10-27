import { AtSign } from "lucide-react";
import { headers } from "next/headers";
import { publicOrigin } from "@/lib/site";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, Kpi, PageHeader } from "@/components/ui/page";
import { badge, ui } from "@/components/ui/styles";
import { dayKey, fillProspectMessage, PROSPECT_STATUS_LABEL, PROSPECT_STATUSES, type ProspectStatusKey } from "@/domain";
import { can } from "@/lib/auth/permissions";
import { currentActor } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { listProspects, myProspectMessages } from "@/lib/prospects/prospects";
import { staffContext } from "@/lib/staff/context";
import { AddProspectsForm, MessageBox, MessagesForm, NoteForm, StatusSelect } from "./forms";

export const dynamic = "force-dynamic";

type Search = { situacao?: string; quem?: string; followup?: string; q?: string };

const TONE: Record<ProspectStatusKey, string> = { FIRST_MESSAGE: badge.neutral, FOLLOW_UP: badge.sky, FORM_SENT: badge.amber, SIGNED_UP: badge.green, DECLINED: badge.red };
const fmt = (day: string) => day.split("-").reverse().join("/");

// Prospecção (U6, D-PROSPECT): perfis abordados antes do formulário, no lugar da aba "Prospecção Hunter" da Central.
export default async function ProspeccaoPage({ searchParams }: { searchParams: Promise<Search> }) {
  const actor = await currentActor();
  if (!actor) redirect("/entrar?next=/admin/prospeccao");
  const { brand } = await staffContext(actor);
  if (!brand || !can(actor.grants, "prospects.own", brand.id)) redirect("/conta");
  const sp = await searchParams;
  const status = PROSPECT_STATUSES.find((s) => s === sp.situacao);
  const data = await listProspects(db(), actor, brand.id, { ...(status ? { status } : {}), ...(sp.quem ? { owner: sp.quem } : {}), followUp: sp.followup === "1", ...(sp.q ? { q: sp.q } : {}) });
  const h = await headers();
  const msgs = await myProspectMessages(db(), actor, brand.id, publicOrigin(h));
  const seeApps = can(actor.grants, "creators.view", brand.id);
  const qs = (patch: Partial<Search>) => {
    const p = new URLSearchParams(Object.entries({ ...sp, ...patch }).filter(([, v]) => v) as [string, string][]);
    return `/admin/prospeccao${p.size ? `?${p}` : ""}`;
  };

  return (
    <>
      <PageHeader title="Prospecção">
        Perfis abordados {data.seeAll ? "pela equipe" : "por você"} antes de se inscreverem. Quem se inscreve com o mesmo @ vira <strong>Inscrita</strong> sozinha;
        em 1ª mensagem ou Forms enviado há 3 dias sem mudar, o perfil pede follow up.
      </PageHeader>

      <Card>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Kpi label="Abordadas no mês" value={data.kpis.month} />
          <Kpi label="Forms enviado" value={data.kpis.formSent} />
          <Kpi label="Inscritas" value={data.kpis.signedUp} />
          <Kpi label="Fazer follow up" value={data.kpis.followUp} tone={data.kpis.followUp ? "amber" : undefined} />
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Registrar abordagem">
          <AddProspectsForm brandId={brand.id} today={dayKey(new Date())} />
        </Card>
        <Card title="Mensagens prontas">
          <MessageBox title="1. Mensagem inicial" text={fillProspectMessage(msgs.first, msgs.vars)} />
          <MessageBox title="2. Proposta (se ela responder que sim)" text={fillProspectMessage(msgs.proposal, msgs.vars)} />
          {msgs.canEdit && (
            <details>
              <summary className="cursor-pointer text-sm text-stone-500">Editar as mensagens da {brand.name}</summary>
              <div className="mt-3"><MessagesForm brandId={brand.id} first={msgs.first} proposal={msgs.proposal} /></div>
            </details>
          )}
        </Card>
      </div>

      <Card title={`Perfis (${data.rows.length}${data.rows.length !== data.total ? ` de ${data.total}` : ""})`}>
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            <Link href={qs({ situacao: "", followup: "" })} className={!status && sp.followup !== "1" ? ui.pillOn : ui.pill}>Todos</Link>
            <Link href={qs({ followup: sp.followup === "1" ? "" : "1", situacao: "" })} className={sp.followup === "1" ? ui.pillOn : ui.pill}>Fazer follow up ({data.kpis.followUp})</Link>
            {PROSPECT_STATUSES.map((s) => (
              <Link key={s} href={qs({ situacao: s, followup: "" })} className={status === s ? ui.pillOn : ui.pill}>{PROSPECT_STATUS_LABEL[s]}</Link>
            ))}
          </div>
          <form className="flex flex-wrap gap-2">
            {status && <input type="hidden" name="situacao" value={status} />}
            {sp.followup === "1" && <input type="hidden" name="followup" value="1" />}
            <input name="q" defaultValue={sp.q ?? ""} placeholder="Buscar @ ou observação" className={`${ui.inputSm} min-w-48 flex-1`} />
            {data.seeAll && data.owners.length > 1 && (
              <select name="quem" defaultValue={sp.quem ?? ""} className={ui.inputSm} aria-label="Quem abordou">
                <option value="">Todas as pessoas</option>
                {data.owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            )}
            <button className={ui.ghostSm}>Filtrar</button>
          </form>
        </div>
        {data.rows.length === 0 ? (
          <p className={ui.muted}>{data.total === 0 ? "Nenhum perfil registrado ainda." : "Nenhum perfil com esses filtros."}</p>
        ) : (
          <ul className={ui.list}>
            {data.rows.map((r) => (
              <li key={r.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:gap-4">
                <div className="flex min-w-0 flex-col gap-0.5 sm:w-64">
                  <a href={`https://instagram.com/${r.handle}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 truncate font-medium hover:underline">
                    <AtSign className="size-3.5 shrink-0" />{r.handle}
                  </a>
                  <span className={ui.hint}>{fmt(r.approachedOn)}{data.seeAll ? ` · ${r.owner}` : ""}</span>
                </div>
                <div className="flex flex-wrap items-center gap-2 sm:w-56">
                  {r.canEdit && !r.application ? <StatusSelect id={r.id} status={r.status} locked={false} /> : <span className={TONE[r.status]}>{PROSPECT_STATUS_LABEL[r.status]}</span>}
                  {r.followUp && <span className={badge.amber}>fazer follow up</span>}
                </div>
                <div className="min-w-0 flex-1 text-sm">
                  {r.application ? (
                    seeApps ? (
                      <Link href={`/admin/candidatas?ver=${r.application.status}&q=${encodeURIComponent(r.handle)}`} className={ui.link}>Inscrita: {r.application.fullName}</Link>
                    ) : (
                      <span>Inscrita: {r.application.fullName}</span>
                    )
                  ) : r.canEdit ? (
                    <NoteForm id={r.id} note={r.note} />
                  ) : (
                    <span className="text-stone-500">{r.note}</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
