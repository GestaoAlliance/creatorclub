import { ExternalLink, Megaphone, Trophy } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Card } from "@/components/ui/page";
import { GlassLight } from "@/components/ui/glass-light";
import { campaignAudience, campaignClock, campaignImpact, campaignInvitees } from "@/lib/campaigns/board";
import { CampaignMessages, ClockBar, DuplicateButton } from "../parts";
import { badge, ui } from "@/components/ui/styles";
import { CAMPAIGN_PHASE_LABEL, CREATOR_CATEGORY_LABEL, formatBRL, shortBRL, trendOf, type CreatorCategoryValue } from "@/domain";
import { currentActor } from "@/lib/auth/current";
import { CampaignError, campaignDetail } from "@/lib/campaigns/campaigns";
import { brandTags } from "@/lib/creators/tags";
import { campaignPosts } from "@/lib/posts/posts";
import { PostList } from "@/components/posts";
import { db } from "@/lib/db";
import { CampaignForm, PublishButton, SettleButton } from "../forms";

export const dynamic = "force-dynamic";

const br = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
const MEDAL = ["🥇", "🥈", "🥉"];
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
  const now = new Date();
  const [posts, impact, invitees, audience, brand] = await Promise.all([
    campaignPosts(db(), c.brandId, c.id),
    campaignImpact(db(), c, now),
    campaignInvitees(db(), c),
    campaignAudience(db(), c),
    db().brand.findUniqueOrThrow({ where: { id: c.brandId }, select: { whatsappInstance: true } }),
  ]);
  const paid = new Map<string, number>();
  for (const p of c.prizes) paid.set(p.creatorId, (paid.get(p.creatorId) ?? 0) + p.amountCents);
  const phoneOf = new Map(audience.map((a) => [a.id, a.hasPhone]));
  const who = [...c.categories.map((k) => CREATOR_CATEGORY_LABEL[k as CreatorCategoryValue]), ...c.tags.map((t) => `tag ${t.name}`)];
  const clock = campaignClock(c, now);
  const leader = Math.max(1, c.standings[0]?.salesCents ?? 0);
  const prizePlaces = c.rankingPrizes.length;
  const lastPrizeSales = prizePlaces ? (c.standings[prizePlaces - 1]?.salesCents ?? 0) : 0;
  const trend = trendOf(impact.periodCents, impact.beforeCents);
  const entrants = c.standings.map((s) => ({ id: s.creatorId, name: s.name, hasPhone: phoneOf.get(s.creatorId) ?? false }));
  const messagesOpen = c.publishedAt !== null && c.endsAt > now;
  const podium = c.standings.filter((s) => s.salesCents > 0).slice(0, 3);
  return (
    <GlassLight className="dash flex flex-col gap-4">
      <Link href="/admin/campanhas" className={`${ui.link} self-start text-sm`}>← Campanhas</Link>
      <section className="@container relative isolate overflow-hidden rounded-[32px] text-white shadow-[0_30px_60px_-34px_var(--brand)]">
        <div aria-hidden className="brand-art absolute inset-0 -z-10" />
        <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(80%_60%_at_50%_-20%,rgb(255_255_255/0.22),transparent_70%)]" />
        <div className="flex flex-col gap-5 p-5 md:p-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-white/70">
                Campanha <span className="rounded-full bg-white/90 px-2 py-0.5 text-[10px] tracking-normal text-stone-900">{CAMPAIGN_PHASE_LABEL[c.phase]}</span>
              </p>
              <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{c.name}</h1>
              <p className="mt-1 text-sm text-white/80">
                {br(c.startDay)} a {br(c.endDay)} · {c.phase === "RUNNING" ? `dia ${clock.day} de ${clock.total}` : c.phase === "SOON" ? `começa em ${clock.toStart} dia${clock.toStart === 1 ? "" : "s"}` : `${clock.total} dias`} · público: {who.length ? who.join(", ") : "todas as creators ativas"}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {c.allianceOsUrl && <a href={c.allianceOsUrl} target="_blank" rel="noopener noreferrer" className="peek-chip">AllianceOS <ExternalLink className="size-3" /></a>}
              {c.canEdit && <DuplicateButton id={c.id} />}
            </div>
          </div>
          {c.phase !== "DRAFT" && c.phase !== "SOON" && <ClockBar day={c.phase === "RUNNING" ? clock.day : clock.total} total={clock.total} light />}
          <div className="grid grid-cols-2 gap-2 @3xl:grid-cols-4">
            {[
              { label: "Inscritas", value: `${impact.entries}`, hint: `de ${audience.length} que podem (${audience.length ? Math.round((impact.entries / audience.length) * 100) : 0}%)` },
              { label: "Vendas no período", value: formatBRL(impact.periodCents), hint: impact.days ? (trend.dir === "new" ? "antes: nada" : trend.pct !== null ? `${trend.pct > 0 ? "+" : ""}${trend.pct}% vs. ${impact.days} dias antes` : "igual aos dias antes") : "ainda não começou" },
              { label: "Venderam", value: `${impact.sellers}`, hint: `de ${impact.entries} inscritas` },
              { label: impact.prizesPaid ? "Prêmios pagos" : "Prêmios previstos", value: formatBRL(impact.prizesCents), hint: impact.periodCents ? `${Math.round((impact.prizesCents / impact.periodCents) * 1000) / 10}% das vendas` : "pelo placar de agora" },
            ].map((t) => (
              <div key={t.label} className="frost-tile flex min-w-0 flex-col gap-0.5 rounded-2xl px-3.5 py-3 text-stone-900 dark:text-white">
                <span className="truncate text-[11px] font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-300">{t.label}</span>
                <span className="whitespace-nowrap text-[clamp(1rem,5cqi,1.6rem)] font-semibold tabular-nums leading-tight">{t.value}</span>
                <span className="truncate text-[11px] text-stone-500 dark:text-stone-300">{t.hint}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
      {c.canEdit && c.phase === "DRAFT" && <PublishButton id={c.id} />}
      {c.canEdit && c.phase === "SETTLE" && <SettleButton id={c.id} label={`Confirmar ganhadoras e lançar os prêmios`} />}
      {c.phase === "WAITING" && <p className={ui.hint}>Encerrada. Os prêmios podem ser confirmados a partir de {c.settleFrom.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })} (7 dias para cancelamentos e estornos).</p>}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] xl:items-start">
        <Card title={`Placar (${c.standings.length} inscrita${c.standings.length === 1 ? "" : "s"})`} icon={<Trophy className="size-4" />}>
          {podium.length > 0 && (
            <ol className="grid grid-cols-3 items-end gap-2">
              {[1, 0, 2].map((i) => {
                const s = podium[i];
                if (!s) return <li key={i} />;
                const h = i === 0 ? "pt-6" : i === 1 ? "pt-3" : "pt-1";
                return (
                  <li key={s.creatorId} className={`liquid-tile flex flex-col items-center gap-1 rounded-2xl px-2 pb-3 text-center ${h}`}>
                    <span className="text-2xl">{MEDAL[i]}</span>
                    <Link href={`/admin/creators/${s.creatorId}`} className="w-full truncate text-sm font-semibold hover:underline">{s.name}</Link>
                    <span className="text-xs tabular-nums text-stone-600 dark:text-stone-300">{shortBRL(s.salesCents)}</span>
                  </li>
                );
              })}
            </ol>
          )}
          {c.standings.length === 0 ? (
            <p className={ui.muted}>Ninguém se inscreveu ainda.</p>
          ) : (
            <ol className="flex flex-col gap-2.5">
              {c.standings.map((s) => {
                const prize = c.settledAt ? (paid.get(s.creatorId) ?? 0) : s.rankPrizeCents + s.goalPrizeCents;
                const toGoal = c.goalCents && s.salesCents < c.goalCents ? c.goalCents - s.salesCents : 0;
                const toPrize = !c.settledAt && prizePlaces && s.position > prizePlaces && lastPrizeSales > s.salesCents ? lastPrizeSales - s.salesCents : 0;
                return (
                  <li key={s.creatorId} className="flex flex-col gap-1">
                    <span className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="flex min-w-0 items-baseline gap-2">
                        <span className="w-7 shrink-0 text-xs tabular-nums text-stone-400">{s.position}º</span>
                        <Link href={`/admin/creators/${s.creatorId}`} className="truncate hover:underline">{s.name}</Link>
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        <span className="tabular-nums">{formatBRL(s.salesCents)}</span>
                        {prize ? <span className={badge.green}>{formatBRL(prize)}</span> : null}
                      </span>
                    </span>
                    <span className="ml-9 h-1.5 overflow-hidden rounded-full bg-stone-500/10"><span className={`block h-full rounded-full ${prize ? "bg-emerald-500" : "bg-brand/60 dark:bg-brand-2/60"}`} style={{ width: `${Math.max(1, (s.salesCents / leader) * 100)}%` }} /></span>
                    {!c.settledAt && (toGoal > 0 || toPrize > 0) && (
                      <span className="ml-9 text-[11px] text-stone-500">
                        {toPrize > 0 && `faltam ${formatBRL(toPrize)} para o ${prizePlaces}º lugar`}
                        {toPrize > 0 && toGoal > 0 && " · "}
                        {toGoal > 0 && `faltam ${formatBRL(toGoal)} para a meta`}
                      </span>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
          {!c.settledAt && c.standings.length > 0 && <p className={ui.hint}>Prévia: muda até a confirmação (vendas pagas no período; empate: fica na frente quem chegou antes).</p>}
        </Card>
        <div className="flex flex-col gap-4">
          {c.canEdit && (
            <Card title="Recados pelo WhatsApp da marca" icon={<Megaphone className="size-4" />}>
              <CampaignMessages campaignId={c.id} campaignName={c.name} invitees={invitees} entrants={entrants} whatsappOn={brand.whatsappInstance !== null} open={messagesOpen} />
            </Card>
          )}
          {/* M4.6 (D-POSTS): posts ligados à campanha. */}
          <Card title={`Posts da campanha (${posts.length})`}>
            <PostList posts={posts} showCreator canRemove={c.canEdit} />
          </Card>
        </div>
      </div>
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
    </GlassLight>
  );
}
