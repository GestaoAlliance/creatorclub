import { ExternalLink, Trophy } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Card, PageHeader } from "@/components/ui/page";
import { badge, ui } from "@/components/ui/styles";
import { CAMPAIGN_PHASE_LABEL, CREATOR_CATEGORY_LABEL, formatBRL, type CreatorCategoryValue } from "@/domain";
import { currentActor } from "@/lib/auth/current";
import { CampaignError, campaignDetail } from "@/lib/campaigns/campaigns";
import { brandTags } from "@/lib/creators/tags";
import { db } from "@/lib/db";
import { CampaignForm, PublishButton, SettleButton } from "../forms";
import { PHASE_TONE } from "../tone";

export const dynamic = "force-dynamic";

const br = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
const reais = (c: number | null | undefined) => (c ? String(c / 100).replace(".", ",") : "");

export default async function CampanhaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await currentActor();
  if (!actor) redirect(`/entrar?next=/admin/campanhas/${id}`);
  let c;
  try {
    c = await campaignDetail(db(), actor, id);
  } catch (error) {
    if (error instanceof CampaignError) notFound();
    throw error;
  }
  const tags = c.canEdit ? await brandTags(db(), c.brandId) : [];
  const paid = new Map<string, number>();
  for (const p of c.prizes) paid.set(p.creatorId, (paid.get(p.creatorId) ?? 0) + p.amountCents);
  const audience = [...c.categories.map((k) => CREATOR_CATEGORY_LABEL[k as CreatorCategoryValue]), ...c.tags.map((t) => `tag ${t.name}`)];
  return (
    <>
      <Link href="/admin/campanhas" className={`${ui.link} self-start text-sm`}>← Campanhas</Link>
      <PageHeader title={c.name} actions={<span className={PHASE_TONE[c.phase]}>{CAMPAIGN_PHASE_LABEL[c.phase]}</span>}>
        {br(c.startDay)} a {br(c.endDay)} · público: {audience.length ? audience.join(", ") : "todas as creators ativas"}
        {c.allianceOsUrl && (
          <> · <a href={c.allianceOsUrl} target="_blank" rel="noopener noreferrer" className={`${ui.link} inline-flex items-center gap-1`}>AllianceOS <ExternalLink className="size-3" /></a></>
        )}
      </PageHeader>
      {c.canEdit && c.phase === "DRAFT" && <PublishButton id={c.id} />}
      {c.canEdit && c.phase === "SETTLE" && <SettleButton id={c.id} label={`Confirmar ganhadoras e lançar os prêmios`} />}
      {c.phase === "WAITING" && <p className={ui.hint}>Encerrada. Os prêmios podem ser confirmados a partir de {c.settleFrom.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })} (7 dias para cancelamentos e estornos).</p>}
      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr] lg:items-start">
        <Card title={`Placar (${c.standings.length} inscrita${c.standings.length === 1 ? "" : "s"})`} icon={<Trophy className="size-4" />}>
          {c.standings.length === 0 ? (
            <p className={ui.muted}>Ninguém se inscreveu ainda.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-stone-500 [&>th]:pb-2">
                  <th>#</th><th>Creator</th><th className="text-right">Vendas</th><th className="text-right">{c.settledAt ? "Prêmio pago" : "Prêmio"}</th>
                </tr>
              </thead>
              <tbody>
                {c.standings.map((s) => {
                  const prize = c.settledAt ? (paid.get(s.creatorId) ?? 0) : s.rankPrizeCents + s.goalPrizeCents;
                  return (
                    <tr key={s.creatorId} className="border-t border-stone-200/70 dark:border-white/10 [&>td]:py-2">
                      <td className="tabular-nums">{s.position}º</td>
                      <td><Link href={`/admin/creators/${s.creatorId}`} className="hover:underline">{s.name}</Link></td>
                      <td className="text-right tabular-nums">{formatBRL(s.salesCents)}</td>
                      <td className="text-right">
                        {prize ? <span className={badge.green}>{formatBRL(prize)}</span> : <span className="text-stone-400">—</span>}
                        {!c.settledAt && s.goalPrizeCents > 0 && <span className="block text-[11px] text-stone-500">meta atingida</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          {!c.settledAt && c.standings.length > 0 && <p className={ui.hint}>Prévia: muda até a confirmação (vendas pagas no período; empate: fica na frente quem chegou antes).</p>}
        </Card>
        <Card title="Briefing e regras">
          {c.canEdit && !c.settledAt ? (
            <CampaignForm
              tags={tags}
              locked={c.publishedAt !== null}
              v={{ id: c.id, name: c.name, briefing: c.briefing, startDay: c.startDay, endDay: c.endDay, categories: c.categories, tagIds: c.tagIds, rankingPrizes: c.rankingPrizes.map((p) => reais(p)), goal: reais(c.goalCents), goalPrize: reais(c.goalPrizeCents), allianceOsUrl: c.allianceOsUrl ?? "" }}
            />
          ) : (
            <p className="whitespace-pre-line text-sm">{c.briefing}</p>
          )}
        </Card>
      </div>
    </>
  );
}
