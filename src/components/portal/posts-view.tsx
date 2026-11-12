"use client";

import { AlertTriangle, ChevronDown, ExternalLink, Flame, Heart, Lightbulb, MessageCircle, Plus, Sparkles, Trophy } from "lucide-react";
import { useActionState, useState } from "react";
import { addMyPostAction } from "@/app/portal/[marca]/posts/actions";
import { RemovePost } from "@/components/posts";
import { InstagramIcon, TikTokIcon } from "@/components/ui/social-icons";
import { Msg } from "@/components/ui/msg";
import { badge, ui } from "@/components/ui/styles";
import { formatBRL, igShortcode, parsePostUrl, POST_PLATFORM_LABEL, shortBRL, tiktokDay, type PostPlatform } from "@/domain";
import type { MyPost, portalPostsBoard } from "@/lib/portal/posts-board";

type Board = Awaited<ReturnType<typeof portalPostsBoard>>;
const br = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const M = ({ children }: { children: React.ReactNode }) => <span className="money">{children}</span>;
const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const monthName = (m: string) => MONTHS[Number(m.slice(5, 7)) - 1]!;

function Platform({ p }: { p: PostPlatform }) {
  if (p === "INSTAGRAM") return <InstagramIcon className="size-4 text-pink-600" />;
  if (p === "TIKTOK") return <TikTokIcon className="size-4" />;
  return <span className="text-[10px] font-semibold text-stone-500">{POST_PLATFORM_LABEL[p]}</span>;
}

/** Faixa: posts do mês, último post (aviso com 7+ dias), melhor do mês, sequência de semanas e registrar. */
export function PostsHero({ b }: { b: Board }) {
  const late = b.summary.daysSince !== null && b.summary.daysSince >= 7;
  return (
    <section className="@container relative isolate overflow-hidden rounded-[32px] text-white shadow-[0_30px_60px_-34px_var(--brand)]">
      <div aria-hidden className="brand-art absolute inset-0 -z-10" />
      <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(80%_60%_at_50%_-20%,rgb(255_255_255/0.22),transparent_70%)]" />
      <div className="flex flex-col gap-4 p-5 md:p-7">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-white/75">Seus posts de {monthName(b.today)}</p>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <p className="text-4xl font-semibold tabular-nums leading-none">{b.summary.monthPosts} <span className="text-base font-normal text-white/80">{b.summary.monthPosts === 1 ? "post no mês" : "posts no mês"}</span></p>
          <a href="#registrar" className="inline-flex items-center gap-1.5 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-stone-900 shadow-sm"><Plus className="size-4" />Registrar post</a>
        </div>
        {late && (
          <p className="flex items-start gap-2 rounded-2xl bg-amber-300/25 px-3 py-2 text-sm">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <span>
              Há {b.summary.daysSince} dias sem postar.
              {b.compare && b.compare.withCents > b.compare.withoutCents && <> Nas semanas em que você posta, sua comissão costuma ser <M>{formatBRL(b.compare.withCents)}</M>; sem post, <M>{formatBRL(b.compare.withoutCents)}</M>.</>}
            </span>
          </p>
        )}
        <div className="grid grid-cols-3 gap-2">
          {[
            { k: "u", label: "Último post", v: b.summary.lastDay ? (b.summary.daysSince === 0 ? "hoje" : b.summary.daysSince === 1 ? "ontem" : `há ${b.summary.daysSince} dias`) : "—" },
            { k: "m", label: "Melhor post", v: b.summary.bestOfMonth ? `R$ ${Math.round(b.summary.bestOfMonth.commissionCents / 100).toLocaleString("pt-BR")}` : "—" },
            { k: "s", label: "Sequência", v: `${b.streak.streak} sem.` },
          ].map((t) => (
            <div key={t.k} className="frost-tile flex min-w-0 flex-col rounded-2xl px-3 py-2.5 text-stone-900 dark:text-white">
              <span className="truncate text-[10px] font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-300">{t.label}</span>
              <span className="truncate text-base font-semibold tabular-nums @md:text-xl">{t.v}</span>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="flex gap-1" aria-label={`Últimas 8 semanas: postou em ${b.streak.weeks.filter((w) => w.posted).length}`}>
            {b.streak.weeks.map((w) => <span key={w.start} title={`semana de ${br(w.start)}`} className={`size-4 rounded-[5px] ${w.posted ? "bg-white" : "bg-white/20"}`} />)}
          </span>
          <span className="text-xs text-white/80">últimas 8 semanas{b.streak.streak >= 2 && <Flame className="ml-1 inline size-3.5" />}</span>
        </div>
      </div>
    </section>
  );
}

/** Registrar: reconhece a rede ao colar, avisa se o post já está na lista e acha o dia do vídeo do TikTok. */
export function RegisterPost({ marca, brandName, today, timeZone, campaigns, posts }: { marca: string; brandName: string; today: string; timeZone: string; campaigns: { id: string; name: string }[]; posts: MyPost[] }) {
  const [state, action, pending] = useActionState(addMyPostAction, undefined);
  const [url, setUrl] = useState("");
  const [day, setDay] = useState(today);
  const parsed = url.trim() ? parsePostUrl(url) : null;
  const code = parsed?.ok ? igShortcode(parsed.url) : null;
  const twin = parsed?.ok ? posts.find((p) => p.url === parsed.url || (code && igShortcode(p.url) === code)) : undefined;
  const onUrl = (v: string) => {
    setUrl(v);
    const p = parsePostUrl(v);
    const d = p.ok ? tiktokDay(p.url, timeZone) : null;
    if (d && d <= today) setDay(d);
  };
  return (
    <section id="registrar" className={`${ui.card} scroll-mt-24`}>
      <h2 className="font-semibold">Registrar um post</h2>
      <form action={action} className="flex flex-col gap-3" onSubmit={() => setTimeout(() => setUrl(""), 0)}>
        <input type="hidden" name="marca" value={marca} />
        <label className={ui.label}>
          Link do post (Instagram, TikTok, YouTube…)
          <input name="url" required inputMode="url" value={url} onChange={(e) => onUrl(e.target.value)} placeholder="Cole o link aqui" className={ui.input} />
        </label>
        {parsed && (
          <p className={`flex items-center gap-1.5 text-xs ${!parsed.ok || twin ? "text-amber-700 dark:text-amber-300" : "text-emerald-700 dark:text-emerald-300"}`}>
            {!parsed.ok ? parsed.error : twin ? `Esse post já está na sua lista (${twin.source === "INSTAGRAM" ? "detectado" : "registrado"} em ${br(twin.postedDay)}).` : <><Platform p={parsed.platform} /> {POST_PLATFORM_LABEL[parsed.platform]} reconhecido{parsed.platform === "TIKTOK" && tiktokDay(parsed.url, timeZone) ? " · dia preenchido pelo link" : ""}</>}
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={ui.label}>Dia em que postou<input name="postedDay" type="date" value={day} onChange={(e) => setDay(e.target.value)} max={today} required className={ui.input} /></label>
          {campaigns.length > 0 && (
            <label className={ui.label}>
              Campanha (opcional)
              <select name="campaignId" defaultValue="" className={ui.input}>
                <option value="">Nenhuma</option>
                {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
          )}
        </div>
        <Msg state={state} />
        <button className={`${ui.btn} self-start`} disabled={pending || Boolean(twin) || (parsed !== null && !parsed.ok)}><Plus className="size-4" />Registrar post</button>
        <p className={ui.hint}>Posts do Instagram em que você marca a {brandName} entram sozinhos; não precisa registrar.</p>
      </form>
    </section>
  );
}

/** O que mais vende para ela: formato e dia da semana. */
export function Insights({ b }: { b: Board }) {
  const { format, weekday } = b.insights;
  if (!format && !weekday) return null;
  return (
    <section className="glass flex flex-col gap-2 rounded-3xl p-4 md:p-5">
      <h2 className="flex items-center gap-2 font-semibold"><Sparkles className="size-4" />O que mais vende para você</h2>
      <ul className="flex flex-col gap-1.5 text-sm">
        {format && <li><strong>{format.name}</strong> rende em média <M>{formatBRL(format.avgCents)}</M> de comissão por post <span className="text-stone-500">({format.posts} posts)</span>.</li>}
        {weekday && <li>Posts de <strong>{weekday.name}</strong> rendem mais: <M>{formatBRL(weekday.avgCents)}</M> em média.</li>}
      </ul>
      <p className={ui.hint}>Comissão nos 3 dias depois de cada post.</p>
    </section>
  );
}

/** Os 3 posts que mais deram comissão. */
export function TopPosts({ top }: { top: MyPost[] }) {
  if (!top.length) return null;
  const medal = ["🥇", "🥈", "🥉"];
  return (
    <section className="glass flex flex-col gap-2 rounded-3xl p-4 md:p-5">
      <h2 className="flex items-center gap-2 font-semibold"><Trophy className="size-4" />Seus posts campeões</h2>
      <ul className="flex flex-col gap-1.5 text-sm">
        {top.map((p, i) => (
          <li key={p.id} className="flex items-center gap-2">
            <span className="text-lg leading-none">{medal[i]}</span>
            <a href={p.url} target="_blank" rel="noopener noreferrer" className="flex min-w-0 flex-1 items-center gap-1.5 hover:underline"><Platform p={p.platform} /><span className="truncate">{p.format} de {br(p.postedDay)}</span></a>
            <span className="shrink-0 font-semibold tabular-nums"><M>{formatBRL(p.commissionCents)}</M></span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Ideias da semana. */
export function Ideas({ ideas }: { ideas: string[] }) {
  return (
    <section className="glass flex flex-col gap-2 rounded-3xl p-4 md:p-5">
      <h2 className="flex items-center gap-2 font-semibold"><Lightbulb className="size-4" />Ideias para esta semana</h2>
      <ol className="flex flex-col gap-1.5 text-sm">
        {ideas.map((t, i) => <li key={i} className="flex gap-2"><span className="w-4 shrink-0 font-semibold text-stone-400">{i + 1}</span>{t}</li>)}
      </ol>
    </section>
  );
}

function Row({ p, marca }: { p: MyPost; marca: string | null }) {
  return (
    <details className="group/row border-t border-stone-200/70 first:border-0 dark:border-white/10">
      <summary className="flex cursor-pointer list-none items-center gap-2.5 py-2.5">
        <span className="w-10 shrink-0 tabular-nums text-xs text-stone-500">{br(p.postedDay)}</span>
        <Platform p={p.platform} />
        <span className="flex min-w-0 flex-1 flex-col items-start gap-0.5 text-sm">
          <span className="max-w-full truncate">{p.format}</span>
          {(p.campaign || p.source === "INSTAGRAM") && (
            <span className="flex max-w-full flex-wrap gap-1 text-[11px]">
              {p.campaign && <span className={`${badge.amber} max-w-full truncate`}>{p.campaign.name}</span>}
              {p.source === "INSTAGRAM" && <span className={badge.sky}>detectado</span>}
            </span>
          )}
        </span>
        <span className="shrink-0 text-right">
          <span className="block text-sm font-semibold tabular-nums"><M>{formatBRL(p.commissionCents)}</M></span>
          <span className="block text-[11px] text-stone-500">{p.orders} {p.orders === 1 ? "pedido" : "pedidos"}{p.complete ? "" : " · até agora"}</span>
        </span>
      </summary>
      <div className="flex flex-col gap-1.5 pb-3 pl-12 text-xs">
        <a href={p.url} target="_blank" rel="noopener noreferrer" className={`${ui.link} inline-flex max-w-full items-center gap-1`}><span className="truncate">{p.url.replace(/^https:\/\/(www\.)?/, "")}</span><ExternalLink className="size-3 shrink-0" /></a>
        {(p.likes !== null || p.comments !== null) && <span className="flex items-center gap-3 text-stone-500"><span className="inline-flex items-center gap-1"><Heart className="size-3" />{p.likes ?? 0}</span><span className="inline-flex items-center gap-1"><MessageCircle className="size-3" />{p.comments ?? 0}</span></span>}
        <span className="text-stone-500">
          Comissão nos 3 dias a partir do post{p.complete ? "" : " (ainda contando)"}.
          {p.complete && (p.aboveCents > 0 ? <span className="font-medium text-emerald-700 dark:text-emerald-400"> +<M>{formatBRL(p.aboveCents)}</M> acima do normal.</span> : <> Normal: <M>{formatBRL(p.normalCents)}</M>.</>)}
          {p.overlap && <span className="text-amber-700 dark:text-amber-300"> Perto de outro post: a venda aparece nos dois.</span>}
          {p.byStaff && " Registrado pela equipe."}
        </span>
        {marca && p.source === "MANUAL" && <span className="self-start"><RemovePost postId={p.id} marca={marca} /></span>}
      </div>
    </details>
  );
}

/** Lista compacta por mês (só o mês mais recente aberto). */
export function PostMonths({ posts, marca }: { posts: MyPost[]; marca: string | null }) {
  if (!posts.length) return <section className={ui.card}><p className={ui.muted}>Nenhum post ainda. Registre o primeiro aqui em cima.</p></section>;
  const months = [...new Set(posts.map((p) => p.postedDay.slice(0, 7)))];
  return (
    <section className="glass flex flex-col rounded-3xl px-4 py-1 md:px-5">
      {months.map((m, i) => {
        const list = posts.filter((p) => p.postedDay.startsWith(m));
        return (
          <details key={m} open={i === 0} className="group border-b border-stone-200/70 last:border-0 dark:border-white/10">
            <summary className="flex cursor-pointer list-none items-center gap-2 py-3">
              <ChevronDown className="size-4 shrink-0 text-stone-400 transition-transform group-open:rotate-180" />
              <span className="flex-1 font-semibold capitalize">{monthName(m)} {m.slice(0, 4)}</span>
              <span className="text-xs text-stone-500">{list.length} {list.length === 1 ? "post" : "posts"}</span>
            </summary>
            <div className="pb-1">{list.map((p) => <Row key={p.id} p={p} marca={marca} />)}</div>
          </details>
        );
      })}
    </section>
  );
}
