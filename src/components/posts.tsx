"use client";

import { ExternalLink, X } from "lucide-react";
import { useActionState } from "react";
import { removeMyPostAction, addMyPostAction } from "@/app/portal/[marca]/posts/actions";
import { staffAddPostAction, staffRemovePostAction } from "@/app/admin/conteudo/actions";
import { InstagramIcon, TikTokIcon } from "@/components/ui/social-icons";
import { Msg } from "@/components/ui/msg";
import { badge, ui } from "@/components/ui/styles";
import { formatBRL, POST_PLATFORM_LABEL, type PostPlatform } from "@/domain";
import type { PostWithSales } from "@/lib/posts/posts";

const br = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

function Platform({ p }: { p: PostPlatform }) {
  if (p === "INSTAGRAM") return <InstagramIcon className="size-4 text-pink-600" />;
  if (p === "TIKTOK") return <TikTokIcon className="size-4" />;
  return <span className="text-xs font-medium text-stone-500">{POST_PLATFORM_LABEL[p]}</span>;
}

function Remove({ postId, marca }: { postId: string; marca: string | null }) {
  const [state, action, pending] = useActionState(marca ? removeMyPostAction : staffRemovePostAction, undefined);
  return (
    <form action={action} onSubmit={(e) => { if (!confirm("Tirar este post? Use só se foi registrado por engano.")) e.preventDefault(); }}>
      {marca && <input type="hidden" name="marca" value={marca} />}
      <input type="hidden" name="postId" value={postId} />
      <button className="text-stone-400 hover:text-red-700" disabled={pending} aria-label="Tirar post" title="Tirar post"><X className="size-4" /></button>
      {state?.error && <span className="text-xs text-red-700">{state.error}</span>}
    </form>
  );
}

/** Lista de posts com as vendas depois de cada um (M4.6, D-POSTS). */
export function PostList({ posts, showCreator = false, canRemove, marca = null }: { posts: PostWithSales[]; showCreator?: boolean; canRemove: boolean; marca?: string | null }) {
  if (!posts.length) return <p className={ui.muted}>Nenhum post registrado ainda.</p>;
  return (
    <ul className={ui.list}>
      {posts.map((p) => (
        <li key={p.id} className="flex flex-wrap items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
          <div className="flex min-w-0 items-start gap-2.5">
            <span className="mt-0.5"><Platform p={p.platform} /></span>
            <div className="min-w-0">
              <p className="text-sm">
                {showCreator && <a href={`/admin/creators/${p.creatorId}`} className="font-medium hover:underline">{p.creatorName} · </a>}
                postado em {br(p.postedDay)}
                {p.campaign && <span className={`${badge.amber} ml-2`}>{p.campaign.name}</span>}
                {p.byStaff && <span className="ml-2 text-xs text-stone-500">(registrado pela equipe)</span>}
              </p>
              <a href={p.url} target="_blank" rel="noopener noreferrer" className={`${ui.link} inline-flex max-w-full items-center gap-1 truncate text-xs`}>
                <span className="truncate">{p.url.replace(/^https:\/\/(www\.)?/, "")}</span> <ExternalLink className="size-3 shrink-0" />
              </a>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="text-right text-sm">
              <p className="font-semibold tabular-nums">{formatBRL(p.windowCents)}</p>
              <p className="text-xs text-stone-500">
                {p.complete ? "em 3 dias" : "até agora (3 dias)"}
                {p.complete && p.aboveCents > 0 && <span className="block font-medium text-emerald-700 dark:text-emerald-400">+{formatBRL(p.aboveCents)} acima do normal</span>}
                {p.complete && p.aboveCents <= 0 && <span className="block">normal: {formatBRL(p.normalCents)}</span>}
                {p.overlap && <span className="block text-amber-700 dark:text-amber-300">perto de outro post</span>}
              </p>
            </div>
            {canRemove && <Remove postId={p.id} marca={marca} />}
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Registrar um post: no portal (marca) ou pela equipe na ficha (creatorId). */
export function PostForm({ marca = null, creatorId = null, today, campaigns }: { marca?: string | null; creatorId?: string | null; today: string; campaigns: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState(marca ? addMyPostAction : staffAddPostAction, undefined);
  return (
    <form action={action} className="flex flex-col gap-3">
      {marca && <input type="hidden" name="marca" value={marca} />}
      {creatorId && <input type="hidden" name="creatorId" value={creatorId} />}
      <label className={ui.label}>Link do post (Instagram, TikTok, YouTube…)<input name="url" required inputMode="url" placeholder="https://www.instagram.com/p/…" className={ui.input} /></label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={ui.label}>Dia em que postou<input name="postedDay" type="date" defaultValue={today} max={today} required className={ui.input} /></label>
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
      <button className={`${ui.btn} self-start`} disabled={pending}>Registrar post</button>
    </form>
  );
}
