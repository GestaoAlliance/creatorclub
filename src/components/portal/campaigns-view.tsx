"use client";

import { ArrowDown, ArrowUp, ChevronDown, Clock, ExternalLink, Gift, Link2, Megaphone, Plus, Trophy } from "lucide-react";
import { useActionState, useState } from "react";
import { joinCampaignAction } from "@/app/portal/[marca]/campanhas/actions";
import { addMyPostAction } from "@/app/portal/[marca]/posts/actions";
import { Msg } from "@/components/ui/msg";
import { badge, ui } from "@/components/ui/styles";
import { briefingParts, formatBRL, shortBRL, type CampaignPhase } from "@/domain";
import { Avatar } from "@/components/ui/avatar";
import { ShareButton } from "./share-button";

export type PortalCampaign = {
  id: string;
  name: string;
  briefing: string;
  startDay: string;
  endDay: string;
  countdown: string | null;
  phase: CampaignPhase;
  rankingPrizes: number[];
  goalCents: number | null;
  goalPrizeCents: number | null;
  joined: boolean;
  canJoin: boolean;
  participants: number;
  top: { position: number; name: string; me: boolean; id: string }[];
  me: { position: number; move: number | null; salesCents: number | null; toAboveCents: number | null; toGoalCents: number | null } | null;
  prizes: { amountCents: number; kind: string; position: number | null }[];
  posts: { id: string; url: string; postedDay: string }[];
};

export type CampaignPrizes = { totalCents: number; list: { id: string; name: string; amountCents: number; kind: string; position: number | null; at: Date }[] };
export type CampaignShare = { code: string; link: string; discountBps: number | null; brandName: string } | null;

const br = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const closed = (p: CampaignPhase) => p === "WAITING" || p === "SETTLE" || p === "SETTLED";

/** "Quero participar" (no cartão e na faixa). */
function Join({ marca, id, light = false }: { marca: string; id: string; light?: boolean }) {
  const [state, action, pending] = useActionState(joinCampaignAction, undefined);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="marca" value={marca} />
      <input type="hidden" name="campaignId" value={id} />
      <button className={light ? "inline-flex items-center gap-1.5 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-stone-900 shadow-sm disabled:opacity-60" : ui.btn} disabled={pending}>
        Quero participar
      </button>
      <Msg state={state} />
    </form>
  );
}

/** Subiu/caiu no placar desde ontem. */
function Move({ n, light = false }: { n: number | null; light?: boolean }) {
  if (!n) return null;
  const up = n > 0;
  const tone = light ? "bg-white/20 text-white" : up ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : "bg-red-500/15 text-red-700 dark:text-red-300";
  return (
    <span className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-semibold ${tone}`}>
      {up ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />}
      {up ? `subiu ${n}` : `caiu ${-n}`} desde ontem
    </span>
  );
}

/** Barra até a meta (só quando a campanha tem meta em R$). */
function GoalBar({ c, light = false }: { c: PortalCampaign; light?: boolean }) {
  if (!c.goalCents || !c.me || c.me.salesCents === null) return null;
  const pct = Math.min(100, Math.round((c.me.salesCents / c.goalCents) * 100));
  return (
    <div className="flex flex-col gap-1">
      <span className={`h-2 overflow-hidden rounded-full ${light ? "bg-white/25" : "bg-stone-300/60 dark:bg-white/10"}`}>
        <span className={`block h-full rounded-full ${light ? "bg-white" : "bg-brand dark:bg-brand-2"}`} style={{ width: `${pct}%` }} />
      </span>
      <span className={`text-xs ${light ? "text-white/80" : "text-stone-500"}`}>
        {c.me.toGoalCents ? <>Meta: <span className="money">{formatBRL(c.me.salesCents)}</span> de <span className="money">{formatBRL(c.goalCents)}</span> · faltam <span className="money">{formatBRL(c.me.toGoalCents)}</span></> : "Meta batida! 🎯 O prêmio é seu."}
      </span>
    </div>
  );
}

function prizeChips(c: PortalCampaign, light = false) {
  const chip = light ? "inline-flex rounded-full bg-white/18 px-2.5 py-1 font-semibold text-white" : null;
  return (
    <div className="flex flex-wrap gap-1.5 text-xs">
      {c.rankingPrizes.map((p, i) => <span key={i} className={chip ?? badge.green}>{i + 1}º lugar: {formatBRL(p)}</span>)}
      {c.goalCents && <span className={chip ?? badge.sky}>Vendeu {formatBRL(c.goalCents)}? Ganha {formatBRL(c.goalPrizeCents ?? 0)}</span>}
    </div>
  );
}

/**
 * Faixa da campanha da vez (D-PORTALCAMPAIGN): a que está acontecendo (de preferência uma em que ela está inscrita);
 * sem nenhuma, a próxima. Contagem regressiva, posição, subiu/caiu, quanto falta, meta e compartilhar o cupom.
 */
export function CampaignHero({ marca, campaigns, share }: { marca: string; campaigns: PortalCampaign[]; share: CampaignShare }) {
  const running = campaigns.filter((c) => c.phase === "RUNNING");
  const c = running.find((x) => x.joined) ?? running[0] ?? campaigns.find((x) => x.phase === "SOON") ?? null;
  const shareText = share ? `Use meu cupom ${share.code} na ${share.brandName}${share.discountBps ? ` e ganhe ${(share.discountBps / 100).toLocaleString("pt-BR")}% de desconto` : ""}:` : "";
  return (
    <section className="@container relative isolate overflow-hidden rounded-[32px] text-white shadow-[0_30px_60px_-34px_var(--brand)]">
      <div aria-hidden className="brand-art absolute inset-0 -z-10" />
      <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(80%_60%_at_50%_-20%,rgb(255_255_255/0.22),transparent_70%)]" />
      <div className="flex flex-col gap-4 p-5 md:p-7">
        <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-white/75">
          <Trophy className="size-3.5" />
          {!c ? "Campanhas" : c.phase === "RUNNING" ? "Campanha da vez" : "Próxima campanha"}
        </p>
        {!c ? (
          <div>
            <p className="text-2xl font-semibold leading-tight">Nenhuma campanha agora</p>
            <p className="mt-1 text-sm text-white/80">Quando a equipe publicar uma, você recebe um aviso e ela aparece aqui.</p>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <h2 className="text-2xl font-semibold leading-tight md:text-3xl">{c.name}</h2>
                <p className="mt-0.5 text-sm text-white/80">{br(c.startDay)} a {br(c.endDay)} · vendas pagas no período</p>
              </div>
              {c.countdown && <span className="inline-flex items-center gap-1.5 rounded-full bg-white/18 px-3 py-1 text-xs font-semibold"><Clock className="size-3.5" />{c.countdown}</span>}
            </div>
            {c.joined && c.me && c.phase === "RUNNING" ? (
              <div className="grid grid-cols-2 gap-2">
                <div className="frost-tile flex min-w-0 flex-col rounded-2xl px-3 py-2.5 text-stone-900 dark:text-white">
                  <span className="truncate text-[10px] font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-300">Sua posição</span>
                  <span className="text-xl font-semibold tabular-nums @md:text-2xl">{c.me.position}º <span className="text-sm font-normal text-stone-500 dark:text-stone-300">de {c.participants}</span></span>
                </div>
                <div className="frost-tile flex min-w-0 flex-col rounded-2xl px-3 py-2.5 text-stone-900 dark:text-white">
                  <span className="truncate text-[10px] font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-300">{c.me.position === 1 ? "Você lidera" : `Para passar a ${c.me.position - 1}ª`}</span>
                  <span className="truncate text-xl font-semibold tabular-nums @md:text-2xl">{c.me.toAboveCents !== null ? <span className="money">{shortBRL(c.me.toAboveCents)}</span> : "🏆"}</span>
                </div>
              </div>
            ) : c.joined ? (
              <p className="text-sm text-white/85">Você está inscrita. O placar começa no primeiro dia.</p>
            ) : (
              <div className="flex flex-col gap-3">
                {prizeChips(c, true)}
                {c.canJoin && <Join marca={marca} id={c.id} light />}
              </div>
            )}
            {c.joined && c.phase === "RUNNING" && <GoalBar c={c} light />}
            <div className="flex flex-wrap items-center gap-2">
              {c.me && <Move n={c.me.move} light />}
              {share && c.phase === "RUNNING" && <span className="ml-auto"><ShareButton text={shareText} url={share.link} /></span>}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

/** Briefing recolhido em 3 linhas, com "ler tudo"; os links viram botões. */
function Briefing({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const parts = briefingParts(text);
  const long = parts.text.length > 180 || parts.text.split("\n").length > 3;
  return (
    <div className="flex flex-col gap-2">
      {parts.text && <p className={`whitespace-pre-line text-sm ${!open && long ? "line-clamp-3" : ""}`}>{parts.text}</p>}
      {long && <button type="button" onClick={() => setOpen(!open)} className={`${ui.link} self-start text-sm`}>{open ? "Mostrar menos" : "Ler tudo"}</button>}
      {parts.links.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {parts.links.map((l) => (
            <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer" className="liquid-tile inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold">
              <ExternalLink className="size-3.5" />{l.label}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

/** Registrar o post desta campanha sem sair do cartão. */
function PostHere({ marca, id, today }: { marca: string; id: string; today: string }) {
  const [state, action, pending] = useActionState(addMyPostAction, undefined);
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="marca" value={marca} />
      <input type="hidden" name="campaignId" value={id} />
      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
        <input name="url" required inputMode="url" placeholder="Link do post (https://…)" aria-label="Link do post" className={ui.input} />
        <input name="postedDay" type="date" defaultValue={today} max={today} required aria-label="Dia em que postou" className={ui.input} />
      </div>
      <Msg state={state} />
      <button className={`${ui.btn} self-start`} disabled={pending}><Plus className="size-4" />Registrar post</button>
    </form>
  );
}

/** Placar: posição e primeiro nome das 10 primeiras; dela, posição, subiu/caiu e quanto falta (sem R$ das outras). */
function Board({ c }: { c: PortalCampaign }) {
  if (!c.me) return null;
  return (
    <div className={`${ui.inset} flex flex-col gap-3`}>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span>Você está em <strong>{c.me.position}º</strong> de {c.participants}</span>
        <Move n={c.me.move} />
      </div>
      {c.phase === "RUNNING" && c.me.toAboveCents !== null && <p className={ui.hint}>Faltam <span className="money">{formatBRL(c.me.toAboveCents)}</span> em vendas para passar a {c.me.position - 1}ª.</p>}
      <GoalBar c={c} />
      <ol className="flex flex-col gap-1 text-sm">
        {c.top.map((t) => (
          <li key={t.position} className={`flex items-center gap-2 ${t.me ? "font-semibold" : ""}`}>
            <span className="w-7 tabular-nums text-stone-500">{t.position}º</span>
            <Avatar name={t.name} id={t.id} size="sm" />
            {t.me ? "Você" : t.name}
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Cartão de campanha acontecendo ou em breve. */
function CampaignCard({ marca, c, today }: { marca: string; c: PortalCampaign; today: string | null }) {
  return (
    <section className={`${ui.card} gap-4`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="grid size-9 shrink-0 place-content-center rounded-2xl bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"><Trophy className="size-4" /></span>
          <div className="min-w-0">
            <h3 className="font-semibold">{c.name}</h3>
            <p className={ui.hint}>{br(c.startDay)} a {br(c.endDay)} · vendas pagas no período</p>
          </div>
        </div>
        {c.countdown && <span className={c.phase === "RUNNING" ? badge.green : badge.sky}>{c.countdown}</span>}
      </div>
      {prizeChips(c)}
      <Briefing text={c.briefing} />
      {c.canJoin && <Join marca={marca} id={c.id} />}
      {c.joined && <Board c={c} />}
      {c.joined && c.phase === "RUNNING" && (
        <div className="flex flex-col gap-2">
          <h4 className="flex items-center gap-1.5 text-sm font-semibold"><Megaphone className="size-4" />Seus posts nesta campanha <span className="font-normal text-stone-500">{c.posts.length}</span></h4>
          {c.posts.length > 0 && (
            <ul className="flex flex-col gap-1 text-sm">
              {c.posts.map((p) => (
                <li key={p.id} className="flex items-center gap-2">
                  <span className="w-11 shrink-0 tabular-nums text-xs text-stone-500">{br(p.postedDay)}</span>
                  <a href={p.url} target="_blank" rel="noopener noreferrer" className={`${ui.link} min-w-0 truncate`}><Link2 className="mr-1 inline size-3.5" />{p.url.replace(/^https?:\/\/(www\.)?/, "")}</a>
                </li>
              ))}
            </ul>
          )}
          {today && <PostHere marca={marca} id={c.id} today={today} />}
        </div>
      )}
    </section>
  );
}

/** Encerrada: uma linha (resultado), abre com o placar e o briefing. */
function ClosedRow({ c }: { c: PortalCampaign }) {
  const won = c.prizes.reduce((t, p) => t + p.amountCents, 0);
  const result = !c.joined ? "você não participou" : c.phase !== "SETTLED" ? "resultado em breve" : won ? `ganhou ${formatBRL(won)} 🎉` : c.me ? `ficou em ${c.me.position}º` : "sem vendas no período";
  return (
    <details className="group border-b border-stone-200/70 last:border-0 dark:border-white/10">
      <summary className="flex cursor-pointer list-none items-center gap-3 py-3">
        <ChevronDown className="size-4 shrink-0 text-stone-400 transition-transform group-open:rotate-180" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{c.name}</span>
          <span className={ui.hint}>{br(c.startDay)} a {br(c.endDay)}</span>
        </span>
        <span className={`shrink-0 text-xs font-semibold ${won ? "text-emerald-700 dark:text-emerald-300" : "text-stone-500"}`}>{result}</span>
      </summary>
      <div className="flex flex-col gap-3 pb-4 pl-7">
        {won > 0 && <p className="text-sm">O prêmio já está no seu saldo.</p>}
        {prizeChips(c)}
        <Briefing text={c.briefing} />
        {c.joined && <Board c={c} />}
      </div>
    </details>
  );
}

/** Prêmios que ela já ganhou em campanhas. */
function Prizes({ prizes }: { prizes: CampaignPrizes }) {
  if (!prizes.totalCents) return null;
  return (
    <section className="glass flex flex-col gap-3 rounded-3xl p-4 md:p-5">
      <h2 className="flex items-start gap-2 font-semibold"><Gift className="mt-0.5 size-4 shrink-0" /><span>Você já ganhou <span className="money">{formatBRL(prizes.totalCents)}</span> em campanhas</span></h2>
      <ul className="flex flex-col gap-1.5 text-sm">
        {prizes.list.map((p) => (
          <li key={p.id} className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 truncate">{p.name} <span className="text-stone-500">· {p.kind === "GOAL" ? "meta batida" : `${p.position}º lugar`}</span></span>
            <span className="shrink-0 font-semibold tabular-nums"><span className="money">{formatBRL(p.amountCents)}</span></span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Campanhas no portal (D-PORTALCAMPAIGN): faixa da campanha da vez, prêmios ganhos e os grupos por momento. */
export function CampaignsView({ marca, campaigns, prizes, share, today }: { marca: string; campaigns: PortalCampaign[]; prizes: CampaignPrizes; share: CampaignShare; today: string | null }) {
  const running = campaigns.filter((c) => c.phase === "RUNNING");
  const soon = campaigns.filter((c) => c.phase === "SOON");
  const ended = campaigns.filter((c) => closed(c.phase)).reverse();
  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <CampaignHero marca={marca} campaigns={campaigns} share={share} />
      <Prizes prizes={prizes} />
      {running.length > 0 && (
        <div className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">Acontecendo agora</h2>
          {running.map((c) => <CampaignCard key={c.id} marca={marca} c={c} today={today} />)}
        </div>
      )}
      {soon.length > 0 && (
        <div className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">Em breve</h2>
          {soon.map((c) => <CampaignCard key={c.id} marca={marca} c={c} today={today} />)}
        </div>
      )}
      {ended.length > 0 && (
        <section className="glass flex flex-col rounded-3xl px-4 py-2 md:px-5">
          <h2 className="pt-2 text-sm font-semibold uppercase tracking-wide text-stone-500">Encerradas</h2>
          {ended.map((c) => <ClosedRow key={c.id} c={c} />)}
        </section>
      )}
    </div>
  );
}
