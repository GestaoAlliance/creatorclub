import { CalendarClock, Plus, Trophy } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { GlassLight } from "@/components/ui/glass-light";
import { CAMPAIGN_PHASE_LABEL, formatBRL, shortBRL } from "@/domain";
import { can } from "@/lib/auth/permissions";
import { currentActor } from "@/lib/auth/current";
import { campaignCards, type CampaignCard } from "@/lib/campaigns/board";
import { db } from "@/lib/db";
import { staffContext } from "@/lib/staff/context";
import { ClockBar } from "./parts";
import { PHASE_TONE } from "./tone";

export const dynamic = "force-dynamic";

const br = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const MEDAL = ["🥇", "🥈", "🥉"];

function when(c: CampaignCard): string {
  if (c.phase === "RUNNING") return c.clock.toEnd <= 1 ? "último dia" : `faltam ${c.clock.toEnd} dias`;
  if (c.phase === "SOON") return c.clock.toStart <= 1 ? "começa amanhã" : `começa em ${c.clock.toStart} dias`;
  if (c.phase === "WAITING") return `confirmar a partir de ${c.settleFrom.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" })}`;
  if (c.phase === "SETTLE") return "pronta para confirmar os prêmios";
  if (c.phase === "DRAFT") return "rascunho: falta publicar";
  return "prêmios confirmados";
}

/** Cartão vivo (D-CAMPAIGNBOARD): fase, tempo, inscritas de quantas podem, vendas e o pódio. */
function Card({ c }: { c: CampaignCard }) {
  const pct = c.audience ? Math.round((c.entries / c.audience) * 100) : 0;
  const live = c.phase === "RUNNING";
  const prize = [...c.prizes.ranking.slice(0, 3).map((p, i) => `${i + 1}º ${shortBRL(p)}`), ...(c.prizes.goalCents ? [`meta ${shortBRL(c.prizes.goalCents)} → ${shortBRL(c.prizes.goalPrizeCents ?? 0)}`] : [])].join(" · ");
  return (
    <Link href={`/admin/campanhas/${c.id}`} className={`group flex flex-col gap-3 rounded-3xl p-5 transition-transform hover:-translate-y-0.5 ${live ? "liquid-tile ring-2 ring-brand/40 dark:ring-brand-2/40" : "liquid-tile"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-lg font-semibold">{c.name}</p>
          <p className="text-xs text-stone-500">{br(c.startDay)} a {br(c.endDay)} · {when(c)}</p>
        </div>
        <span className={`${PHASE_TONE[c.phase]} shrink-0`}>{live && <span className="mr-1 inline-block size-1.5 animate-pulse rounded-full bg-current align-middle" />}{CAMPAIGN_PHASE_LABEL[c.phase]}</span>
      </div>
      {(live || c.phase === "WAITING" || c.phase === "SETTLE" || c.phase === "SETTLED") && <ClockBar day={c.phase === "RUNNING" ? c.clock.day : c.clock.total} total={c.clock.total} />}
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-500">Inscritas</p>
          <p className="font-semibold tabular-nums">{c.entries} <span className="text-xs font-normal text-stone-500">de {c.audience} ({pct}%)</span></p>
          <span className="mt-1 block h-1 overflow-hidden rounded-full bg-stone-500/12"><span className="block h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} /></span>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-500">Vendas no período</p>
          <p className="font-semibold tabular-nums">{formatBRL(c.salesCents)}</p>
        </div>
      </div>
      {c.podium.length > 0 ? (
        <ol className="flex flex-col gap-1 text-sm">
          {c.podium.map((p, i) => (
            <li key={p.creatorId} className="flex items-center gap-2">
              <span className="w-5 text-center">{MEDAL[i]}</span>
              <span className="min-w-0 flex-1 truncate">{p.name}</span>
              <span className="tabular-nums text-stone-600 dark:text-stone-300">{shortBRL(p.salesCents)}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-sm text-stone-500">{c.phase === "DRAFT" || c.phase === "SOON" ? "O placar aparece quando começar." : "Nenhuma venda das inscritas ainda."}</p>
      )}
      {prize && <p className="flex items-center gap-1.5 border-t border-stone-200/70 pt-2 text-xs text-stone-500 dark:border-white/10"><Trophy className="size-3.5 text-amber-500" /> {prize}</p>}
    </Link>
  );
}

// Campanhas e desafios (M4.5, D-CAMPAIGN; D-CAMPAIGNBOARD), na marca do topo.
export default async function CampanhasPage() {
  const actor = await currentActor();
  if (!actor) redirect("/entrar?next=/admin/campanhas");
  const { brand } = await staffContext(actor);
  if (!brand || !can(actor.grants, "creators.view", brand.id)) redirect("/conta");
  const cards = await campaignCards(db(), actor, brand.id);
  const canEdit = can(actor.grants, "creators.edit", brand.id);
  const running = cards.filter((c) => c.phase === "RUNNING");
  const settle = cards.filter((c) => c.phase === "SETTLE").length;
  return (
    <GlassLight className="dash flex flex-col gap-4">
      <section className="@container relative isolate overflow-hidden rounded-[32px] text-white shadow-[0_30px_60px_-34px_var(--brand)]">
        <div aria-hidden className="brand-art absolute inset-0 -z-10" />
        <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(80%_60%_at_50%_-20%,rgb(255_255_255/0.22),transparent_70%)]" />
        <div className="flex flex-col gap-5 p-5 md:p-7">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-white/70">{brand.name}</p>
              <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Campanhas</h1>
              <p className="mt-1 max-w-xl text-sm text-white/80">Desafios para as creators: briefing, inscrição no portal e placar de vendas. O prêmio em dinheiro entra no saldo quando a Gestão confirma as ganhadoras.</p>
            </div>
            {canEdit && <Link href="/admin/campanhas/nova" className="peek-chip"><Plus className="size-3.5" /> Nova campanha</Link>}
          </div>
          <div className="grid grid-cols-2 gap-2 @3xl:grid-cols-4">
            {[
              { label: "Em andamento", value: String(running.length), hint: running.length ? running.map((c) => c.name).join(", ") : "nenhuma agora" },
              { label: "Inscritas agora", value: String(running.reduce((s, c) => s + c.entries, 0)), hint: running.length ? `de ${running.reduce((s, c) => s + c.audience, 0)} que podem` : "—" },
              { label: "Vendas agora", value: shortBRL(running.reduce((s, c) => s + c.salesCents, 0)), hint: "das inscritas no período" },
              { label: "Para confirmar", value: String(settle), hint: settle ? "prêmios esperando a Gestão" : "nada pendente" },
            ].map((t) => (
              <div key={t.label} className="frost-tile flex min-w-0 flex-col gap-0.5 rounded-2xl px-3.5 py-3 text-stone-900 dark:text-white">
                <span className="truncate text-[11px] font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-300">{t.label}</span>
                <span className="text-2xl font-semibold tabular-nums leading-tight">{t.value}</span>
                <span className="truncate text-[11px] text-stone-500 dark:text-stone-300">{t.hint}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
      {cards.length === 0 ? (
        <section className="glass flex flex-col items-center gap-2 rounded-3xl p-10 text-center text-sm text-stone-500">
          <CalendarClock className="size-6" />
          Nenhuma campanha ainda.
          {canEdit && <Link href="/admin/campanhas/nova" className="font-semibold text-brand hover:underline dark:text-brand-2">Criar a primeira →</Link>}
        </section>
      ) : (
        <div className="@container">
          <div className="grid gap-4 @3xl:grid-cols-2 @6xl:grid-cols-3">
            {cards.map((c) => <Card key={c.id} c={c} />)}
          </div>
        </div>
      )}
    </GlassLight>
  );
}
