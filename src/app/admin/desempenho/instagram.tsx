"use client";

import { AtSign, Camera, ExternalLink, MessageCircle, TicketX, TrendingDown, TrendingUp } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { InstagramIcon } from "@/components/ui/social-icons";
import { ui } from "@/components/ui/styles";
import { formatBRL, growthMovers, IG_FORMAT_LABEL, postsNoCoupon } from "@/domain";
import type { instagramRanking, InstagramRow } from "@/lib/instagram/ranking";
import { Avatar } from "../creators/list-parts";
import { MessageSheet, SidePanel } from "./parts";

type Data = Awaited<ReturnType<typeof instagramRanking>>;
type Sort = "seguidores" | "engajamento" | "venda";

const n = (v: number) => v.toLocaleString("pt-BR");
const k = (v: number) => (v >= 10_000 ? `${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil` : n(v));
const pct = (bps: number) => `${(bps / 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
const perWeek = (x100: number) => (x100 / 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 });
const date = (d: Date) => new Date(d).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" });
const ago = (d: Date | null, now: Date) => {
  if (!d) return "sem posts recentes";
  const days = Math.floor((now.getTime() - new Date(d).getTime()) / 86_400_000);
  return days <= 0 ? "postou hoje" : `último post há ${days} ${days === 1 ? "dia" : "dias"}`;
};

const MSG = {
  coupon: {
    title: "Seu cupom nos posts",
    body: "Oi, {nome}! Vimos seus posts recentes e ficaram ótimos 💛\n\nSó um lembrete: coloca seu cupom *{cupom}* na legenda ou nos stories. É por ele que as vendas contam para você.",
  },
  profile: {
    title: "Seu Instagram",
    body: "Oi, {nome}! Para acompanharmos seus resultados, seu Instagram precisa ser *conta profissional* (Criador de conteúdo) e *pública*.\n\nÉ rápido: Configurações > Tipo de conta > Mudar para conta profissional.\n\nSe você trocou de @, me manda o novo por aqui!",
  },
};

function sortRows(rows: InstagramRow[], sort: Sort) {
  const key = (r: InstagramRow) => (sort === "engajamento" ? r.engagementBps : sort === "venda" ? r.salesPer1kCents : r.followers) ?? -1;
  return [...rows].sort((a, b) => key(b) - key(a) || a.name.localeCompare(b.name, "pt-BR"));
}

function Mover({ r, tone }: { r: InstagramRow; tone: "up" | "down" }) {
  return (
    <li className="flex items-center justify-between gap-2 py-1.5 text-sm">
      <Link href={`/admin/creators/${r.creatorId}`} className="min-w-0 truncate hover:underline">{r.name}</Link>
      <span className={`shrink-0 font-semibold tabular-nums ${tone === "up" ? "text-emerald-700 dark:text-emerald-300" : "text-red-700 dark:text-red-300"}`}>
        {r.growth! > 0 ? "+" : ""}{n(r.growth!)}
      </span>
    </li>
  );
}

/** Aba Instagram (D-INSTAGRAM; D-PERFBOARD): cresceu/caiu, posta sem cupom, parede de cartões com painel e perfis a corrigir. */
export function InstagramView({ data, now, canEdit }: { data: Data; now: Date; canEdit: boolean }) {
  const [sort, setSort] = useState<Sort>("seguidores");
  const [open, setOpen] = useState<InstagramRow | null>(null);
  const [msg, setMsg] = useState<{ rows: InstagramRow[]; kind: keyof typeof MSG } | null>(null);
  if (!data.connected) {
    return <section className="glass rounded-3xl p-8 text-center text-sm text-stone-500">O Instagram desta marca ainda não está ligado ao Creator Club. Os números aparecem depois da primeira leitura.</section>;
  }
  const ok = sortRows(data.rows.filter((r) => r.status === "OK"), sort);
  const fix = data.rows.filter((r) => r.status === "UNREADABLE" || r.status === "NO_HANDLE");
  const pending = data.rows.filter((r) => r.status === "PENDING").length;
  const noCoupon = postsNoCoupon(ok, now);
  const movers = growthMovers(ok);
  const tagsOf = (id: string) => data.tags.filter((t) => t.creator?.id === id);

  return (
    <div className="flex flex-col gap-4">
      {(movers.up.length > 0 || movers.down.length > 0 || noCoupon.length > 0) && (
        <div className="@container">
          <div className="grid gap-3 @3xl:grid-cols-3">
            <section className="liquid-tile rounded-3xl p-4">
              <h3 className="flex items-center gap-1.5 text-sm font-semibold"><TrendingUp className="size-4 text-emerald-600" />Mais cresceram no mês</h3>
              {movers.up.length ? <ul className="mt-1 divide-y divide-stone-200/60 dark:divide-white/10">{movers.up.map((r) => <Mover key={r.creatorId} r={r} tone="up" />)}</ul> : <p className="mt-2 text-xs text-stone-500">Ninguém ganhou seguidores ainda.</p>}
            </section>
            <section className="liquid-tile rounded-3xl p-4">
              <h3 className="flex items-center gap-1.5 text-sm font-semibold"><TrendingDown className="size-4 text-red-600" />Mais perderam no mês</h3>
              {movers.down.length ? <ul className="mt-1 divide-y divide-stone-200/60 dark:divide-white/10">{movers.down.map((r) => <Mover key={r.creatorId} r={r} tone="down" />)}</ul> : <p className="mt-2 text-xs text-stone-500">Ninguém perdeu seguidores. 🎉</p>}
            </section>
            <section className="liquid-tile flex flex-col rounded-3xl p-4">
              <h3 className="flex items-center gap-1.5 text-sm font-semibold"><TicketX className="size-4 text-amber-600" />Posta sem cupom <span className="text-stone-500">{noCoupon.length}</span></h3>
              <p className="mt-0.5 text-xs text-stone-500">Postou nos últimos 30 dias e não pôs o cupom em nenhum post.</p>
              {noCoupon.length ? (
                <>
                  <p className="mt-2 line-clamp-2 text-sm">{noCoupon.map((r) => r.name.split(/\s+/)[0]).join(", ")}</p>
                  {canEdit && <button type="button" onClick={() => setMsg({ rows: noCoupon, kind: "coupon" })} className={`${ui.btnSm} mt-auto self-start`}><MessageCircle className="size-3.5" />Lembrar do cupom</button>}
                </>
              ) : (
                <p className="mt-2 text-xs text-stone-500">Todas que postaram usaram o cupom. 🎉</p>
              )}
            </section>
          </div>
        </div>
      )}

      <section className="glass flex flex-wrap items-center gap-2 rounded-3xl p-3 md:p-4">
        <nav aria-label="Ordem" className="flex flex-wrap gap-1.5">
          {(["seguidores", "engajamento", "venda"] as const).map((s) => (
            <button key={s} type="button" aria-pressed={s === sort} onClick={() => setSort(s)} className={`rounded-full px-3 py-1.5 text-sm transition ${s === sort ? "bg-brand font-semibold text-white shadow-sm dark:bg-brand-2 dark:text-stone-900" : "bg-stone-500/10 hover:bg-stone-500/20"}`}>
              {s === "seguidores" ? "Seguidores" : s === "engajamento" ? "Engajamento" : "Venda por mil seguidores"}
            </button>
          ))}
        </nav>
        <span className="ml-auto text-xs text-stone-500">{ok.length} de {data.rows.length} perfis lidos{pending ? ` · ${pending} esperando a 1ª leitura` : ""}</span>
      </section>

      {ok.length === 0 ? (
        <section className="glass rounded-3xl p-8 text-center text-sm text-stone-500">Nenhum perfil lido ainda.</section>
      ) : (
        <div className="@container">
          <ul data-tour="de-cartoes" className="grid gap-3 @xl:grid-cols-2 @4xl:grid-cols-3 @7xl:grid-cols-4">
            {ok.map((r, i) => (
              <li key={r.creatorId}>
                <button type="button" onClick={() => setOpen(r)} className="liquid-tile flex w-full flex-col gap-3 rounded-3xl p-4 text-left transition hover:-translate-y-0.5">
                  <span className="flex items-center gap-3">
                    <span className="relative"><Avatar name={r.name} /><span className="absolute -bottom-1 -right-1 rounded-full bg-white px-1 text-[10px] font-bold tabular-nums text-stone-700 shadow dark:bg-stone-800 dark:text-stone-200">{i + 1}</span></span>
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{r.name}</span>
                      <span className="block truncate text-xs text-stone-500">@{r.handle}</span>
                    </span>
                  </span>
                  <span className="grid grid-cols-3 gap-2 text-xs">
                    <span><span className="block text-stone-500">Seguidores</span><span className="block text-base font-semibold tabular-nums">{k(r.followers ?? 0)}</span>{r.growth !== null && <span className={r.growth >= 0 ? "text-emerald-700 dark:text-emerald-300" : "text-red-700 dark:text-red-300"}>{r.growth >= 0 ? "+" : ""}{n(r.growth)}</span>}</span>
                    <span><span className="block text-stone-500">Engaj.</span><span className="block text-base font-semibold tabular-nums">{r.engagementBps !== null ? pct(r.engagementBps) : "—"}</span>{r.drop?.alert && <span className="text-amber-700 dark:text-amber-300">caiu {pct(r.drop.dropBps)}</span>}</span>
                    <span><span className="block text-stone-500">Por mil</span><span className="block text-base font-semibold tabular-nums"><span className="money">{r.salesPer1kCents !== null ? formatBRL(r.salesPer1kCents).replace(/,00$/, "") : "—"}</span></span><span className="text-stone-500">no mês</span></span>
                  </span>
                  <span className="flex flex-wrap gap-1 text-[11px]">
                    {r.couponPosts > 0 ? <span className="rounded-full bg-emerald-500/12 px-2 py-0.5 text-emerald-800 dark:text-emerald-300">cupom em {r.couponPosts} {r.couponPosts === 1 ? "post" : "posts"}</span> : noCoupon.includes(r) ? <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-amber-900 dark:text-amber-200">posta sem cupom</span> : null}
                    <span className="rounded-full bg-stone-500/10 px-2 py-0.5 text-stone-600 dark:text-stone-300">{ago(r.lastPostAt, now)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {fix.length > 0 && (
        <section className="glass flex flex-col gap-3 rounded-3xl p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h3 className="flex items-center gap-1.5 font-semibold"><AtSign className="size-4" />Perfis a corrigir <span className="text-stone-500">{fix.length}</span></h3>
              <p className="text-xs text-stone-500">A Meta só lê perfil profissional (Criador de conteúdo ou Empresa) e público. Peça a troca, ou corrija o @ na ficha.</p>
            </div>
            {canEdit && <button type="button" onClick={() => setMsg({ rows: fix, kind: "profile" })} className={ui.btnSm}><MessageCircle className="size-3.5" />Pedir a troca para {fix.length}</button>}
          </div>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {fix.map((r) => (
              <li key={r.creatorId} className="liquid-tile flex items-center justify-between gap-2 rounded-2xl px-3 py-2 text-sm">
                <Link href={`/admin/creators/${r.creatorId}`} className="min-w-0 truncate font-medium hover:underline">{r.name}</Link>
                <span className="shrink-0 text-[11px] text-amber-800 dark:text-amber-300">{r.status === "NO_HANDLE" ? "sem @" : `@${r.handle}`}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="glass flex flex-col gap-2 rounded-3xl p-4">
        <h3 className="flex items-center gap-1.5 font-semibold"><Camera className="size-4" />Posts que marcaram a marca</h3>
        {data.tags.length === 0 ? (
          <p className="text-sm text-stone-500">Nenhum post marcou a marca ainda.</p>
        ) : (
          <ul className="divide-y divide-stone-200/70 dark:divide-white/10">
            {data.tags.slice(0, 12).map((t) => (
              <li key={t.permalink} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <span className="min-w-0">
                  {t.creator ? <Link href={`/admin/creators/${t.creator.id}`} className="font-medium hover:underline">{t.creator.name}</Link> : <span className="font-medium">@{t.username} <span className="text-xs font-normal text-stone-500">· não é creator</span></span>}
                  <span className="block text-xs text-stone-500">{date(t.postedAt)} · {n(t.likes ?? 0)} curtidas · {n(t.comments ?? 0)} comentários</span>
                </span>
                <a href={t.permalink} target="_blank" rel="noreferrer" className={ui.ghostSm}><ExternalLink className="size-3.5" />Abrir</a>
              </li>
            ))}
          </ul>
        )}
      </section>

      {open && (
        <SidePanel
          label={`Instagram de ${open.name}`}
          onClose={() => setOpen(null)}
          header={
            <>
              <p className="text-lg font-semibold leading-tight">{open.name}</p>
              <a href={`https://instagram.com/${open.handle}`} target="_blank" rel="noreferrer" className="peek-chip mt-2 inline-flex"><InstagramIcon className="size-3.5" />@{open.handle}</a>
            </>
          }
        >
          <div className="grid grid-cols-2 gap-2">
            {[
              ["Seguidores", n(open.followers ?? 0), open.growth !== null ? `${open.growth >= 0 ? "+" : ""}${n(open.growth)} no mês` : ""],
              ["Engajamento", open.engagementBps !== null ? pct(open.engagementBps) : "—", open.drop?.alert ? `caiu ${pct(open.drop.dropBps)} em 30 dias` : "estável"],
              ["Frequência", `${perWeek(open.postsPerWeekX100 ?? 0)}/semana`, ago(open.lastPostAt, now)],
              ["Venda por mil", open.salesPer1kCents !== null ? formatBRL(open.salesPer1kCents) : "—", "seguidores, no mês"],
            ].map(([l, v, s]) => (
              <div key={l} className="liquid-tile rounded-2xl px-3 py-2.5">
                <span className="block text-[11px] font-medium uppercase tracking-wide text-stone-500">{l}</span>
                <span className="block text-lg font-semibold tabular-nums">{v}</span>
                <span className="block text-xs text-stone-500">{s}</span>
              </div>
            ))}
          </div>
          <ul className="flex flex-col gap-1.5 text-sm">
            {open.best && <li>🎬 <strong>{IG_FORMAT_LABEL[open.best.format]}</strong> é o formato que mais engaja ({pct(open.best.bps)}).</li>}
            <li>{open.couponPosts > 0 ? `🎟️ Cupom em ${open.couponPosts} ${open.couponPosts === 1 ? "post" : "posts"} nos últimos 30 dias.` : noCoupon.includes(open) ? "⚠️ Postou nos últimos 30 dias sem o cupom." : "Sem posts com cupom nos últimos 30 dias."}</li>
          </ul>
          <div className="flex flex-col gap-1.5">
            <p className="text-[11px] font-medium uppercase tracking-wide text-stone-500">Posts que marcaram a marca</p>
            {tagsOf(open.creatorId).length === 0 ? (
              <p className="text-sm text-stone-500">Nenhum ainda.</p>
            ) : (
              tagsOf(open.creatorId).map((t) => (
                <a key={t.permalink} href={t.permalink} target="_blank" rel="noreferrer" className="liquid-tile flex items-center justify-between gap-2 rounded-2xl px-3 py-2 text-sm hover:underline">
                  <span>{date(t.postedAt)} · {n(t.likes ?? 0)} curtidas</span><ExternalLink className="size-3.5" />
                </a>
              ))
            )}
          </div>
          <Link href={`/admin/creators/${open.creatorId}`} className={`${ui.btnSm} self-start`}>Abrir a ficha</Link>
        </SidePanel>
      )}
      {msg && <MessageSheet ids={msg.rows.map((r) => r.creatorId)} names={msg.rows.map((r) => r.name)} {...MSG[msg.kind]} onClose={() => setMsg(null)} />}
    </div>
  );
}
