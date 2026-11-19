"use client";

import { AtSign, ExternalLink, MessageCircle, TicketX } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { InstagramIcon } from "@/components/ui/social-icons";
import { ui } from "@/components/ui/styles";
import { formatBRL, IG_FORMAT_LABEL, postsNoCoupon } from "@/domain";
import type { instagramRanking, InstagramRow } from "@/lib/instagram/ranking";
import { Avatar } from "../creators/list-parts";
import { MessageSheet, SidePanel } from "./parts";

type Data = Awaited<ReturnType<typeof instagramRanking>>;
type Sort = "seguidores" | "crescimento" | "engajamento" | "venda" | "post";

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

const COLS: [Sort, string][] = [["seguidores", "Seguidores"], ["crescimento", "Crescimento"], ["engajamento", "Engajamento"], ["venda", "Venda por mil"], ["post", "Último post"]];

function sortRows(rows: InstagramRow[], sort: Sort) {
  const key = (r: InstagramRow) =>
    (sort === "engajamento" ? r.engagementBps : sort === "venda" ? r.salesPer1kCents : sort === "crescimento" ? r.growth : sort === "post" ? (r.lastPostAt ? new Date(r.lastPostAt).getTime() : null) : r.followers) ?? -Infinity;
  return [...rows].sort((a, b) => key(b) - key(a) || a.name.localeCompare(b.name, "pt-BR"));
}

/** Aba Instagram (D-INSTAGRAM; D-PERFBOARD; D-IGSIMPLE): aviso de quem posta sem cupom, ranking em tabela (ordena pela coluna) com painel e perfis a corrigir. */
export function InstagramView({ data, now, canEdit, phrase = "no mês" }: { data: Data; now: Date; canEdit: boolean; phrase?: string }) {
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
  const tagsOf = (id: string) => data.tags.filter((t) => t.creator?.id === id);

  return (
    <div className="flex flex-col gap-4">
      {/* D-IGSIMPLE: das caixas de cima fica só "Posta sem cupom"; quem cresceu ou caiu aparece ordenando a tabela. */}
      {noCoupon.length > 0 && (
        <section className="flex flex-wrap items-center gap-3 rounded-2xl border border-amber-400/50 bg-amber-100/70 px-4 py-3 text-sm text-amber-950 dark:bg-amber-900/30 dark:text-amber-100">
          <TicketX className="size-4 shrink-0" />
          <span className="min-w-0 flex-1">
            <strong>{noCoupon.length} {noCoupon.length === 1 ? "posta" : "postam"} sem cupom</strong> (postou nos últimos 30 dias e não pôs o cupom em nenhum post): {noCoupon.map((r) => r.name.split(/\s+/)[0]).join(", ")}
          </span>
          {canEdit && <button type="button" onClick={() => setMsg({ rows: noCoupon, kind: "coupon" })} className={ui.btnSm}><MessageCircle className="size-3.5" />Lembrar do cupom</button>}
        </section>
      )}
      <section className="glass overflow-hidden rounded-3xl !p-0" data-tour="de-cartoes">
        <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-stone-200/70 px-4 py-3 dark:border-white/10 md:px-5">
          <h2 className="text-base font-semibold">Ranking do Instagram</h2>
          <span className="text-xs text-stone-500">{ok.length} de {data.rows.length} perfis lidos{pending ? ` · ${pending} esperando a 1ª leitura` : ""} · clique no título da coluna para ordenar</span>
        </header>
        {ok.length === 0 ? (
          <p className="p-8 text-center text-sm text-stone-500">Nenhum perfil lido ainda.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm md:min-w-[860px]">
              <thead className="whitespace-nowrap text-left text-[11px] uppercase tracking-wide text-stone-500">
                <tr className="border-b border-stone-200/70 dark:border-white/10">
                  <th className="w-12 px-4 py-2 font-semibold">#</th>
                  <th className="px-3 py-2 font-semibold">Creator</th>
                  {COLS.map(([id, label]) => (
                    <th key={id} className={`hidden px-3 py-2 text-right font-semibold md:table-cell ${id === "post" ? "pr-4" : ""}`}>
                      <button type="button" onClick={() => setSort(id)} aria-pressed={sort === id} className={`uppercase tracking-wide hover:text-stone-800 dark:hover:text-stone-100 ${sort === id ? "text-brand dark:text-brand-2" : ""}`}>{label}{sort === id ? " ↓" : ""}</button>
                    </th>
                  ))}
                  <th className="hidden px-3 py-2 font-semibold md:table-cell">Cupom nos posts</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-200/70 dark:divide-white/10">
                {ok.map((r, i) => (
                  <tr key={r.creatorId} onClick={() => setOpen(r)} className={`cursor-pointer transition-colors ${open?.creatorId === r.creatorId ? "bg-brand/8" : "hover:bg-stone-500/5"}`}>
                    <td className="px-4 py-2.5 tabular-nums text-stone-500">{i + 1}</td>
                    <td className="px-3 py-2.5">
                      <span className="flex items-center gap-3">
                        <Avatar name={r.name} id={r.creatorId} />
                        <span className="min-w-0">
                          <span className="block font-medium">{r.name}</span>
                          <span className="block text-[11px] text-stone-500">@{r.handle}</span>
                          <span className="flex flex-wrap gap-x-2 text-xs md:hidden">
                            <span className="font-semibold tabular-nums">{k(r.followers ?? 0)}</span>
                            {r.growth !== null && <span className={r.growth >= 0 ? "text-emerald-700 dark:text-emerald-300" : "text-red-700 dark:text-red-300"}>{r.growth >= 0 ? "+" : ""}{n(r.growth)}</span>}
                            <span>engaj. {r.engagementBps !== null ? pct(r.engagementBps) : "—"}</span>
                          </span>
                        </span>
                      </span>
                    </td>
                    <td className="hidden px-3 py-2.5 text-right font-semibold tabular-nums md:table-cell">{k(r.followers ?? 0)}</td>
                    <td className={`hidden px-3 py-2.5 text-right tabular-nums md:table-cell ${r.growth === null ? "text-stone-400" : r.growth >= 0 ? "text-emerald-700 dark:text-emerald-300" : "text-red-700 dark:text-red-300"}`}>{r.growth === null ? "—" : `${r.growth >= 0 ? "+" : ""}${n(r.growth)}`}</td>
                    <td className="hidden px-3 py-2.5 text-right tabular-nums md:table-cell">
                      {r.engagementBps !== null ? pct(r.engagementBps) : "—"}
                      {r.drop?.alert && <span className="block text-[11px] text-amber-700 dark:text-amber-300">caiu {pct(r.drop.dropBps)}</span>}
                    </td>
                    <td className="hidden px-3 py-2.5 text-right tabular-nums md:table-cell"><span className="money">{r.salesPer1kCents !== null ? formatBRL(r.salesPer1kCents).replace(/,00$/, "") : "—"}</span></td>
                    <td className="hidden px-3 py-2.5 pr-4 text-right text-xs text-stone-600 md:table-cell dark:text-stone-300">{r.lastPostAt ? date(r.lastPostAt) : "—"}</td>
                    <td className="hidden px-3 py-2.5 text-xs md:table-cell">
                      {r.couponPosts > 0 ? <span className="rounded-full bg-emerald-500/12 px-2 py-0.5 text-emerald-800 dark:text-emerald-300">em {r.couponPosts} {r.couponPosts === 1 ? "post" : "posts"}</span> : noCoupon.includes(r) ? <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-amber-900 dark:text-amber-200">posta sem cupom</span> : <span className="text-stone-400">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="border-t border-stone-200/70 px-4 py-3 text-xs text-stone-500 dark:border-white/10 md:px-5">Crescimento = seguidores ganhos no mês. Venda por mil = vendas {phrase} a cada mil seguidores. Cupom nos posts: últimos 30 dias.</p>
      </section>
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
                <Link prefetch={false} href={`/admin/creators/${r.creatorId}`} className="min-w-0 truncate font-medium hover:underline">{r.name}</Link>
                <span className="shrink-0 text-[11px] text-amber-800 dark:text-amber-300">{r.status === "NO_HANDLE" ? "sem @" : `@${r.handle}`}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

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
              ["Venda por mil", open.salesPer1kCents !== null ? formatBRL(open.salesPer1kCents) : "—", `seguidores, ${phrase}`],
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
          <Link prefetch={false} href={`/admin/creators/${open.creatorId}`} className={`${ui.btnSm} self-start`}>Abrir a ficha</Link>
        </SidePanel>
      )}
      {msg && <MessageSheet ids={msg.rows.map((r) => r.creatorId)} names={msg.rows.map((r) => r.name)} {...MSG[msg.kind]} onClose={() => setMsg(null)} />}
    </div>
  );
}
