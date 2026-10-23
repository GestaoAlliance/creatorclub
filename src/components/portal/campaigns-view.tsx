"use client";

import { Trophy } from "lucide-react";
import { useActionState } from "react";
import { joinCampaignAction } from "@/app/portal/[marca]/campanhas/actions";
import { Msg } from "@/components/ui/msg";
import { badge, ui } from "@/components/ui/styles";
import { formatBRL, type CampaignPhase } from "@/domain";

export type PortalCampaign = {
  id: string;
  name: string;
  briefing: string;
  startDay: string;
  endDay: string;
  phase: CampaignPhase;
  rankingPrizes: number[];
  goalCents: number | null;
  goalPrizeCents: number | null;
  joined: boolean;
  canJoin: boolean;
  participants: number;
  top: { position: number; name: string; me: boolean }[];
  me: { position: number; salesCents: number; toAboveCents: number | null; toGoalCents: number | null } | null;
  prizes: { amountCents: number; kind: string; position: number | null }[];
};

const br = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const PHASE: Record<CampaignPhase, [string, string]> = {
  DRAFT: ["", badge.neutral],
  SOON: ["em breve", badge.sky],
  RUNNING: ["acontecendo agora", badge.green],
  WAITING: ["encerrada · resultado em breve", badge.amber],
  SETTLE: ["encerrada · resultado em breve", badge.amber],
  SETTLED: ["resultado final", badge.neutral],
};

function Join({ marca, id }: { marca: string; id: string }) {
  const [state, action, pending] = useActionState(joinCampaignAction, undefined);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="marca" value={marca} />
      <input type="hidden" name="campaignId" value={id} />
      <button className={ui.btn} disabled={pending}>Quero participar</button>
      <Msg state={state} />
    </form>
  );
}

/** Campanhas no portal (M4.5, D-CAMPAIGN): briefing, prêmios, inscrição e placar (posição e primeiro nome). */
export function CampaignsView({ marca, campaigns }: { marca: string; campaigns: PortalCampaign[] }) {
  if (campaigns.length === 0) return <p className={ui.muted}>Nenhuma campanha aberta agora. Quando tiver, ela aparece aqui.</p>;
  return (
    <div className="flex flex-col gap-4">
      {campaigns.map((c) => {
        const won = c.prizes.reduce((t, p) => t + p.amountCents, 0);
        return (
          <section key={c.id} className={`${ui.card} gap-4`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <span className="grid size-9 place-content-center rounded-2xl bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"><Trophy className="size-4" /></span>
                <div>
                  <h2 className="font-semibold">{c.name}</h2>
                  <p className={ui.hint}>{br(c.startDay)} a {br(c.endDay)} · vendas pagas no período</p>
                </div>
              </div>
              <span className={PHASE[c.phase][1]}>{PHASE[c.phase][0]}</span>
            </div>
            <div className="flex flex-wrap gap-2 text-sm">
              {c.rankingPrizes.map((p, i) => <span key={i} className={badge.green}>{i + 1}º lugar: {formatBRL(p)}</span>)}
              {c.goalCents && <span className={badge.sky}>Vendeu {formatBRL(c.goalCents)}? Ganha {formatBRL(c.goalPrizeCents ?? 0)}</span>}
            </div>
            <p className="whitespace-pre-line text-sm">{c.briefing}</p>
            {won > 0 && <p className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">🎉 Você ganhou {formatBRL(won)}! O prêmio já está no seu saldo.</p>}
            {c.canJoin && <Join marca={marca} id={c.id} />}
            {c.joined && c.me && (
              <div className={`${ui.inset} flex flex-col gap-3`}>
                <p className="text-sm">
                  Você está em <strong>{c.me.position}º</strong> de {c.participants} · suas vendas: <strong>{formatBRL(c.me.salesCents)}</strong>
                </p>
                {c.phase === "RUNNING" && (
                  <p className={ui.hint}>
                    {c.me.toAboveCents !== null && `Faltam ${formatBRL(c.me.toAboveCents)} para passar a ${c.me.position - 1}ª. `}
                    {c.me.toGoalCents !== null && (c.me.toGoalCents > 0 ? `Faltam ${formatBRL(c.me.toGoalCents)} para a meta.` : "Meta batida! 🎯")}
                  </p>
                )}
                <ol className="flex flex-col gap-1 text-sm">
                  {c.top.map((t) => (
                    <li key={t.position} className={`flex gap-2 ${t.me ? "font-semibold" : ""}`}>
                      <span className="w-7 tabular-nums text-stone-500">{t.position}º</span> {t.me ? "Você" : t.name}
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
