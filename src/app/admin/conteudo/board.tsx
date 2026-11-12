"use client";

import { AtSign, ExternalLink, Heart, MessageCircle, Send, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { RemovePost } from "@/components/posts";
import { InstagramIcon, TikTokIcon } from "@/components/ui/social-icons";
import { ui } from "@/components/ui/styles";
import { addDaysKey, bestOf, contentRanking, formatBRL, POST_PLATFORM_LABEL, shortBRL, TEAM_MESSAGE_MAX, type PostPlatform } from "@/domain";
import type { ContentPost, Mention } from "@/lib/posts/content";
import { Avatar } from "../creators/list-parts";
import { remindPostsAction } from "./actions";

const br = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const num = (n: number | null) => (n === null ? "—" : n >= 1000 ? `${(n / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil` : String(n));
const ext = { target: "_blank", rel: "noopener noreferrer" } as const;

function Net({ p, className = "size-4" }: { p: PostPlatform; className?: string }) {
  if (p === "INSTAGRAM") return <InstagramIcon className={`${className} text-pink-600`} />;
  if (p === "TIKTOK") return <TikTokIcon className={className} />;
  return <span className="text-[11px] font-semibold text-stone-500">{POST_PLATFORM_LABEL[p]}</span>;
}

/** Cartão do mural: creator, rede, dia, curtidas, vendas em 3 dias e o selo acima do normal. */
function PostCard({ p, canRemove }: { p: ContentPost; canRemove: boolean }) {
  const hot = p.complete && p.aboveCents > 0;
  return (
    <article className={`liquid-tile flex flex-col gap-3 rounded-3xl p-4 ${hot ? "ring-2 ring-emerald-500/40" : ""}`}>
      <div className="flex items-center gap-2.5">
        <Avatar name={p.creatorName} id={p.creatorId} />
        <div className="min-w-0 flex-1">
          <Link href={`/admin/creators/${p.creatorId}`} className="block truncate text-sm font-semibold hover:underline">{p.creatorName}</Link>
          <span className="flex items-center gap-1.5 text-xs text-stone-500"><Net p={p.platform} className="size-3.5" /> {br(p.postedDay)} · {p.source === "INSTAGRAM" ? "detectado" : p.byStaff ? "registrado pela equipe" : "registrado por ela"}</span>
        </div>
        <a href={p.url} {...ext} aria-label="Abrir o post" className="grid size-8 place-content-center rounded-full text-stone-500 hover:bg-stone-500/10"><ExternalLink className="size-4" /></a>
        {canRemove && p.source === "MANUAL" && <RemovePost postId={p.id} marca={null} />}
      </div>
      {(p.likes !== null || p.comments !== null || p.campaign) && (
        <div className="flex flex-wrap items-center gap-3 text-xs text-stone-600 dark:text-stone-300">
          {p.likes !== null && <span className="inline-flex items-center gap-1"><Heart className="size-3.5 text-pink-500" />{num(p.likes)}</span>}
          {p.comments !== null && <span className="inline-flex items-center gap-1"><MessageCircle className="size-3.5" />{num(p.comments)}</span>}
          {p.campaign && <span className="rounded-full bg-amber-500/15 px-2 py-0.5 font-semibold text-amber-900 dark:text-amber-200">{p.campaign.name}</span>}
        </div>
      )}
      <div className="flex items-end justify-between gap-2 border-t border-stone-200/70 pt-3 dark:border-white/10">
        <div>
          <p className="text-lg font-semibold tabular-nums leading-tight">{formatBRL(p.windowCents)}</p>
          <p className="text-[11px] text-stone-500">{p.complete ? "vendas em 3 dias" : "até agora (3 dias)"}</p>
        </div>
        {p.complete ? (
          p.aboveCents > 0 ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-1 text-xs font-bold text-emerald-800 dark:text-emerald-300"><Sparkles className="size-3" />+{shortBRL(p.aboveCents)}</span>
          ) : (
            <span className="text-right text-[11px] text-stone-500">normal<br />{shortBRL(p.normalCents)}</span>
          )
        ) : (
          <span className="rounded-full bg-sky-500/12 px-2 py-1 text-[11px] font-semibold text-sky-800 dark:text-sky-300">em andamento</span>
        )}
      </div>
      {p.overlap && <p className="-mt-1 text-[11px] text-amber-700 dark:text-amber-300">perto de outro post dela (as vendas aparecem nos dois)</p>}
    </article>
  );
}

/** Lembrete para quem não postou, pelo WhatsApp da marca (marca quem recebe; texto editável). */
function NotPosted({ people, whatsappOn, canSend }: { people: { id: string; name: string; hasPhone: boolean; lastDay: string | null; days: number }[]; whatsappOn: boolean; canSend: boolean }) {
  const router = useRouter();
  const [picked, setPicked] = useState<Set<string>>(new Set(people.map((p) => p.id)));
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("Bora postar?");
  const [body, setBody] = useState('Oi, {nome}! Faz alguns dias que não vemos um post seu com a marca. Postou e esqueceu de marcar? Marque a marca no post ou registre o link em "Meus posts" no portal. Se precisar de ideia de conteúdo, me chama!');
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<{ ok?: string; error?: string } | null>(null);
  if (!people.length) return <p className="text-sm text-emerald-700 dark:text-emerald-300">Todas postaram nos últimos 15 dias. 🎉</p>;
  return (
    <div className="flex flex-col gap-3">
      <ul className="flex max-h-72 flex-col gap-1 overflow-y-auto">
        {people.map((p) => (
          <li key={p.id} className="flex items-center gap-2 rounded-xl px-1 py-1 text-sm hover:bg-stone-500/5">
            {canSend && <input type="checkbox" checked={picked.has(p.id)} onChange={() => setPicked((s) => { const n = new Set(s); if (n.has(p.id)) n.delete(p.id); else n.add(p.id); return n; })} aria-label={`Marcar ${p.name}`} className="size-4 accent-[var(--brand)]" />}
            <Link href={`/admin/creators/${p.id}`} className="min-w-0 flex-1 truncate hover:underline">{p.name}</Link>
            <span className={`shrink-0 text-xs tabular-nums ${p.days >= 30 ? "font-semibold text-red-700 dark:text-red-300" : "text-amber-700 dark:text-amber-300"}`}>{p.lastDay ? `${p.days} dias` : "nunca"}</span>
          </li>
        ))}
      </ul>
      {canSend && !open && <button type="button" disabled={!picked.size} onClick={() => setOpen(true)} className={`${ui.btnSm} self-start`}><Send className="size-3.5" /> Lembrar {picked.size}</button>}
      {canSend && open && (
        <div className="flex flex-col gap-2">
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={TEAM_MESSAGE_MAX.title} aria-label="Título" className={ui.inputSm} />
          <textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={TEAM_MESSAGE_MAX.body} rows={4} aria-label="Mensagem" className={`${ui.input} resize-y text-sm`} />
          <p className="text-[11px] text-stone-500">{"{nome}"} vira o primeiro nome de cada uma. {whatsappOn ? "Sai pelo WhatsApp da marca (das 9h às 20h) e no portal." : "Sai no portal e por e-mail (WhatsApp da marca não está ligado)."}</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy || !picked.size || !title.trim() || !body.trim()}
              onClick={async () => {
                setBusy(true);
                const r = await remindPostsAction([...picked], title, body);
                setBusy(false);
                setRes(r);
                if (r.ok) {
                  setOpen(false);
                  router.refresh();
                }
              }}
              className={ui.btnSm}
            >
              {busy ? "Mandando…" : `Mandar para ${picked.size}`}
            </button>
            <button type="button" onClick={() => setOpen(false)} className={ui.ghostSm}>Cancelar</button>
          </div>
        </div>
      )}
      {res && <p role={res.error ? "alert" : "status"} className={`text-sm ${res.error ? "text-red-700 dark:text-red-400" : "text-emerald-700 dark:text-emerald-300"}`}>{res.error ?? res.ok}</p>}
    </div>
  );
}

type Period = 30 | 60 | 90;

/**
 * Conteúdo (D-CONTENTBOARD): faixa da marca com os números do período, mural de cartões (registrados + detectados no
 * Instagram), filtros (período, rede, origem), ranking por creator, melhor dia e rede, quem não postou (com lembrete)
 * e quem mais falou da marca.
 */
export function ContentBoard({ posts, mentions, notPosted, brandName, today, whatsappOn, canSend }: { posts: ContentPost[]; mentions: Mention[]; notPosted: { id: string; name: string; hasPhone: boolean; lastDay: string | null; days: number }[]; brandName: string; today: string; whatsappOn: boolean; canSend: boolean }) {
  const [period, setPeriod] = useState<Period>(30);
  const [net, setNet] = useState<PostPlatform | "">("");
  const [source, setSource] = useState<"" | "MANUAL" | "INSTAGRAM">("");
  const since = addDaysKey(today, -period);
  const inPeriod = useMemo(() => posts.filter((p) => p.postedDay >= since), [posts, since]);
  const shown = inPeriod.filter((p) => (!net || p.platform === net) && (!source || p.source === source));
  const nets = [...new Set(inPeriod.map((p) => p.platform))];
  const items = inPeriod.map((p) => ({ creatorId: p.creatorId, platform: p.platform, postedDay: p.postedDay, complete: p.complete, windowCents: p.windowCents, aboveCents: p.aboveCents, likes: p.likes }));
  const ranking = contentRanking(items).slice(0, 8);
  const best = bestOf(items);
  const names = new Map(posts.map((p) => [p.creatorId, p.creatorName]));
  const creatorsPosting = new Set(inPeriod.map((p) => p.creatorId)).size;
  const above = inPeriod.filter((p) => p.complete).reduce((s, p) => s + Math.max(0, p.aboveCents), 0);
  const ment = mentions.filter((m) => m.postedDay >= since);

  return (
    <div className="flex flex-col gap-4">
      <section className="@container relative isolate overflow-hidden rounded-[32px] text-white shadow-[0_30px_60px_-34px_var(--brand)]">
        <div aria-hidden className="brand-art absolute inset-0 -z-10" />
        <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(80%_60%_at_50%_-20%,rgb(255_255_255/0.22),transparent_70%)]" />
        <div className="flex flex-col gap-5 p-5 md:p-7">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-white/70">{brandName}</p>
              <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Conteúdo</h1>
              <p className="mt-1 max-w-xl text-sm text-white/80">Posts que marcaram a marca no Instagram (detectados sozinhos) e os registrados no portal, com as vendas do cupom nos 3 dias depois de cada um.</p>
            </div>
            <div className="liquid-pill" style={{ "--n": 3, "--i": [30, 60, 90].indexOf(period) } as React.CSSProperties} role="tablist" aria-label="Período">
              <span aria-hidden className="drop" />
              {([30, 60, 90] as Period[]).map((d) => (
                <button key={d} type="button" role="tab" aria-selected={period === d} aria-current={period === d ? "true" : undefined} onClick={() => setPeriod(d)}>{d} dias</button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 @3xl:grid-cols-4">
            {[
              { label: "Posts", value: String(inPeriod.length), hint: `${inPeriod.filter((p) => p.source === "INSTAGRAM").length} detectados · ${inPeriod.filter((p) => p.source === "MANUAL").length} registrados` },
              { label: "Creators postando", value: String(creatorsPosting), hint: `${notPosted.length} sem post há 15+ dias` },
              { label: "Vendas acima do normal", value: shortBRL(above), hint: "soma dos posts com 3 dias completos" },
              { label: "Outras menções", value: String(ment.length), hint: "@ que não são creators" },
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

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start">
        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {[["", "Todas as redes"] as const, ...nets.map((n) => [n, POST_PLATFORM_LABEL[n]] as const)].map(([v, l]) => (
              <button key={v || "todas"} type="button" onClick={() => setNet(v)} className={`rounded-full px-3 py-1 text-sm transition-colors ${net === v ? "bg-stone-900 text-white dark:bg-white dark:text-stone-900" : "text-stone-600 hover:bg-stone-500/10 dark:text-stone-300"}`}>{l}</button>
            ))}
            <span className="mx-1 h-4 w-px bg-stone-300 dark:bg-white/15" />
            {([["", "Todos"], ["INSTAGRAM", "Detectados"], ["MANUAL", "Registrados"]] as const).map(([v, l]) => (
              <button key={v || "tudo"} type="button" onClick={() => setSource(v)} className={`rounded-full px-3 py-1 text-sm transition-colors ${source === v ? "bg-brand text-white" : "text-stone-600 hover:bg-stone-500/10 dark:text-stone-300"}`}>{l}</button>
            ))}
            <span className="ml-auto text-xs text-stone-500">{shown.length} posts</span>
          </div>
          {shown.length === 0 ? (
            <section className="glass rounded-3xl p-10 text-center text-sm text-stone-500">Nenhum post neste período. Quando uma creator marcar a marca no Instagram, o post aparece aqui sozinho.</section>
          ) : (
            <div className="@container">
              <div className="grid gap-3 @xl:grid-cols-2 @4xl:grid-cols-3">
                {shown.map((p) => <PostCard key={p.id} p={p} canRemove={canSend} />)}
              </div>
            </div>
          )}
        </div>

        <aside className="flex min-w-0 flex-col gap-4">
          <section className="glass flex flex-col gap-3 rounded-3xl p-4">
            <h2 className={ui.h2}>Quem não postou (15+ dias)</h2>
            <NotPosted people={notPosted} whatsappOn={whatsappOn} canSend={canSend} />
          </section>
          <section className="glass flex flex-col gap-3 rounded-3xl p-4">
            <h2 className={ui.h2}>Ranking de conteúdo</h2>
            {ranking.length === 0 ? (
              <p className="text-sm text-stone-500">Sem posts no período.</p>
            ) : (
              <ol className="flex flex-col gap-2">
                {ranking.map((r, i) => (
                  <li key={r.creatorId} className="flex items-center gap-2 text-sm">
                    <span className="w-5 text-xs tabular-nums text-stone-400">{i + 1}º</span>
                    <Link href={`/admin/creators/${r.creatorId}`} className="min-w-0 flex-1 truncate hover:underline">{names.get(r.creatorId)}</Link>
                    <span className="shrink-0 text-right text-[11px] leading-tight text-stone-500">
                      {r.posts} post{r.posts === 1 ? "" : "s"}{r.avgLikes !== null ? ` · ♥ ${num(r.avgLikes)}` : ""}
                      <span className="block font-semibold text-stone-700 dark:text-stone-200">{shortBRL(r.salesPerPostCents)}/post</span>
                    </span>
                  </li>
                ))}
              </ol>
            )}
            <p className="text-[11px] text-stone-500">Ordem: vendas acima do normal no período; ♥ = média de curtidas no Instagram.</p>
          </section>
          <section className="glass flex flex-col gap-2 rounded-3xl p-4">
            <h2 className={ui.h2}>Melhor dia e rede</h2>
            {best.weekday.length === 0 && best.platform.length === 0 ? (
              <p className="text-sm text-stone-500">Ainda poucos posts com os 3 dias completos para comparar.</p>
            ) : (
              <>
                {best.weekday[0] && <p className="text-sm">Posts de <strong>{best.weekday[0].key}</strong> vendem mais: <strong>+{shortBRL(best.weekday[0].avgAboveCents)}</strong> por post acima do normal ({best.weekday[0].posts} posts).</p>}
                {best.platform[0] && <p className="text-sm">Melhor rede: <strong>{POST_PLATFORM_LABEL[best.platform[0].key as PostPlatform]}</strong> ({best.platform[0].avgAboveCents >= 0 ? "+" : ""}{shortBRL(best.platform[0].avgAboveCents)} por post).</p>}
                <p className="text-[11px] text-stone-500">Só grupos com 2 posts ou mais com os 3 dias completos.</p>
              </>
            )}
          </section>
          {ment.length > 0 && (
            <section className="glass flex flex-col gap-2 rounded-3xl p-4">
              <h2 className={ui.h2}>Quem mais falou da marca</h2>
              <p className="text-[11px] text-stone-500">Marcaram a marca no Instagram, mas o @ não é de nenhuma creator do cadastro. Pode ser uma creator com o @ diferente na ficha, ou alguém para a prospecção.</p>
              <ul className="flex flex-col gap-1.5">
                {ment.slice(0, 12).map((m) => (
                  <li key={m.id} className="flex items-center gap-2 text-sm">
                    <AtSign className="size-3.5 shrink-0 text-stone-400" />
                    <a href={m.url} {...ext} className="min-w-0 flex-1 truncate hover:underline">{m.username}</a>
                    <span className="shrink-0 text-[11px] text-stone-500">{br(m.postedDay)}{m.likes !== null ? ` · ♥ ${num(m.likes)}` : ""}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
