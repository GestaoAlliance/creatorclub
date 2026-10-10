import { Clapperboard } from "lucide-react";
import { Card } from "@/components/ui/page";
import { ui } from "@/components/ui/styles";
import { dayKey, type UgcCycle } from "@/domain";
import { UgcGoalForm, UgcVideoForm, UgcVideoRemoveButton } from "./forms";

const dmy = (day: string | null) => (day ? day.split("-").reverse().join("/") : "—");

/** Ficha → Vídeos (UGC) (D-UGCVIDEOS): contador do ciclo (período do contrato), vídeos registrados, registrar e meta. */
export function UgcVideosCard({ creatorId, status, canEdit, cycle, videos }: {
  creatorId: string;
  status: string;
  canEdit: boolean;
  cycle: UgcCycle;
  videos: { id: string; day: string; url: string; product: string | null }[];
}) {
  return (
    <Card title="Vídeos (UGC)" icon={<Clapperboard className="size-4" />}>
      {cycle.status === "NO_CONTRACT" ? (
        <p className="text-sm text-amber-700 dark:text-amber-300">
          {cycle.outside > 0 ? `${cycle.outside} ${cycle.outside === 1 ? "vídeo registrado" : "vídeos registrados"}. ` : ""}Preencha o início do contrato para contar a meta do ciclo.
        </p>
      ) : (
        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs text-stone-600 dark:text-stone-400">
            <span>
              <strong className="text-lg tabular-nums text-stone-900 dark:text-stone-100">{cycle.count}</strong> de {cycle.goal} vídeos
            </span>
            <span>ciclo {dmy(cycle.start)} a {dmy(cycle.end)}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-stone-200/70 dark:bg-white/10" role="progressbar" aria-valuemin={0} aria-valuemax={cycle.goal} aria-valuenow={cycle.count}>
            <div className={`h-full rounded-full ${cycle.status === "DONE" ? "bg-emerald-500" : "bg-brand"}`} style={{ width: `${Math.min(100, Math.round((cycle.count / cycle.goal) * 100))}%` }} />
          </div>
          {cycle.status === "DONE" && <p className={ui.ok}>Meta do ciclo batida.</p>}
          {cycle.status === "MISSED" && <p className="text-sm font-medium text-red-700 dark:text-red-400">Ciclo terminou sem bater a meta: faltaram {cycle.goal - cycle.count}.</p>}
        </div>
      )}
      {cycle.status !== "NO_CONTRACT" && cycle.outside > 0 && <p className={ui.hint}>{cycle.outside} vídeo(s) com data fora do ciclo atual não contam.</p>}
      {videos.length > 0 && (
        <ul className={ui.list}>
          {videos.map((v) => (
            <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 first:pt-0">
              <span className="min-w-0">
                <a href={v.url} target="_blank" rel="noreferrer" className={`${ui.link} text-sm`}>Vídeo de {dmy(v.day)}</a>
                {v.product && <span className={`${ui.hint} ml-2`}>{v.product}</span>}
              </span>
              {canEdit && <UgcVideoRemoveButton creatorId={creatorId} videoId={v.id} />}
            </li>
          ))}
        </ul>
      )}
      {canEdit && status !== "DEACTIVATED" && <UgcVideoForm creatorId={creatorId} today={dayKey(new Date())} />}
      {canEdit && <UgcGoalForm creatorId={creatorId} goal={cycle.goal} />}
    </Card>
  );
}
