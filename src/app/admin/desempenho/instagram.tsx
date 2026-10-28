import { AtSign, Camera, TrendingDown } from "lucide-react";
import Link from "next/link";
import { Card, Kpi } from "@/components/ui/page";
import { badge, ui } from "@/components/ui/styles";
import { formatBRL, IG_FORMAT_LABEL } from "@/domain";
import type { instagramRanking, InstagramRow } from "@/lib/instagram/ranking";

type Data = Awaited<ReturnType<typeof instagramRanking>>;
export type IgSort = "seguidores" | "engajamento" | "venda";

const n = (v: number) => v.toLocaleString("pt-BR");
const pct = (bps: number) => `${(bps / 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
const perWeek = (x100: number) => (x100 / 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 });
const date = (d: Date) => d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" });
const daysAgo = (d: Date, now: Date) => Math.floor((now.getTime() - d.getTime()) / 86_400_000);

function sortRows(rows: InstagramRow[], sort: IgSort): InstagramRow[] {
  const key = (r: InstagramRow) => (sort === "engajamento" ? r.engagementBps : sort === "venda" ? r.salesPer1kCents : r.followers) ?? -1;
  return [...rows].sort((a, b) => key(b) - key(a) || a.name.localeCompare(b.name, "pt-BR"));
}

/** Aba Instagram do Desempenho (D-INSTAGRAM): ranking, perfis que não dá para ler e posts que marcaram a marca. */
export function InstagramTab({ data, sort, now }: { data: Data; sort: IgSort; now: Date }) {
  if (!data.connected) {
    return (
      <Card title="Instagram" icon={<Camera className="size-4" />}>
        <p className={ui.muted}>O Instagram desta marca ainda não está ligado ao Creator Club. Os números aparecem depois da primeira leitura.</p>
      </Card>
    );
  }
  const ok = sortRows(data.rows.filter((r) => r.status === "OK"), sort);
  const unreadable = data.rows.filter((r) => r.status === "UNREADABLE" || r.status === "NO_HANDLE");
  const pending = data.rows.filter((r) => r.status === "PENDING").length;
  const drops = ok.filter((r) => r.drop?.alert);
  const followers = ok.reduce((s, r) => s + (r.followers ?? 0), 0);
  const growth = ok.reduce((s, r) => s + (r.growth ?? 0), 0);
  return (
    <>
      <Card>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Kpi label="Perfis lidos" value={`${ok.length} de ${data.rows.length}`} hint={pending ? `${pending} esperando a primeira leitura` : "leitura todo dia a partir das 4h"} />
          <Kpi label="Seguidores somados" value={n(followers)} hint={`${growth >= 0 ? "+" : ""}${n(growth)} no mês`} />
          <Kpi label="Queda de engajamento" value={drops.length} hint="caiu 40% ou mais em 30 dias" tone={drops.length ? "amber" : undefined} />
          <Kpi label="Não dá para ler" value={unreadable.length} hint="perfil pessoal, privado ou sem @" tone={unreadable.length ? "amber" : undefined} />
        </div>
      </Card>

      <Card title="Ranking do Instagram" icon={<Camera className="size-4" />}>
        <nav aria-label="Ordem" className="flex flex-wrap gap-2">
          {(["seguidores", "engajamento", "venda"] as const).map((s) => (
            <Link key={s} href={`/admin/desempenho?aba=instagram&igordem=${s}`} className={s === sort ? ui.pillOn : ui.pill}>
              {s === "seguidores" ? "Mais seguidores" : s === "engajamento" ? "Mais engajamento" : "Mais venda por mil seguidores"}
            </Link>
          ))}
        </nav>
        {ok.length === 0 ? (
          <p className={ui.muted}>Nenhum perfil lido ainda.</p>
        ) : (
          <ol className={ui.list}>
            {ok.map((r, i) => (
              <li key={r.creatorId} className="grid gap-3 py-4 md:grid-cols-[2.5rem_1fr_9rem_9rem_11rem] md:items-center">
                <span className="text-lg font-semibold tabular-nums text-stone-400">{i + 1}º</span>
                <span className="min-w-0">
                  <Link href={`/admin/creators/${r.creatorId}`} className="block truncate font-medium hover:underline">{r.name}</Link>
                  <span className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-stone-600 dark:text-stone-400">
                    <a href={`https://instagram.com/${r.handle}`} target="_blank" rel="noreferrer" className="hover:underline">@{r.handle}</a>
                    {r.best && <span className={badge.neutral}>{IG_FORMAT_LABEL[r.best.format]} engaja mais</span>}
                    {r.couponPosts > 0 && <span className={badge.green}>cupom em {r.couponPosts} {r.couponPosts === 1 ? "post" : "posts"} (30 dias)</span>}
                    {r.drop?.alert && (
                      <span className={`${badge.amber} inline-flex items-center gap-1`}>
                        <TrendingDown className="size-3" /> engajamento caiu {pct(r.drop.dropBps)}
                      </span>
                    )}
                  </span>
                </span>
                <span className="flex flex-col">
                  <span className="font-semibold tabular-nums">{n(r.followers ?? 0)}</span>
                  <span className="text-xs text-stone-500">seguidores{r.growth !== null ? ` · ${r.growth >= 0 ? "+" : ""}${n(r.growth)} no mês` : ""}</span>
                </span>
                <span className="flex flex-col">
                  <span className="font-semibold tabular-nums">{r.engagementBps !== null ? pct(r.engagementBps) : "—"}</span>
                  <span className="text-xs text-stone-500">
                    engajamento · {perWeek(r.postsPerWeekX100 ?? 0)} posts/semana
                    {r.lastPostAt ? (daysAgo(r.lastPostAt, now) === 0 ? " · postou hoje" : ` · último há ${daysAgo(r.lastPostAt, now)} ${daysAgo(r.lastPostAt, now) === 1 ? "dia" : "dias"}`) : " · sem posts recentes"}
                  </span>
                </span>
                <span className="flex flex-col">
                  <span className="font-semibold tabular-nums">{r.salesPer1kCents !== null ? formatBRL(r.salesPer1kCents) : "—"}</span>
                  <span className="text-xs text-stone-500">em vendas por mil seguidores (mês)</span>
                </span>
              </li>
            ))}
          </ol>
        )}
      </Card>

      {unreadable.length > 0 && (
        <Card title="Perfis que não dá para ler" icon={<AtSign className="size-4" />}>
          <p className={ui.hint}>A Meta só mostra perfis profissionais (Criador de conteúdo ou Empresa) e públicos. Peça para a creator trocar o tipo de conta, ou corrija o @ na ficha.</p>
          <ul className={ui.list}>
            {unreadable.map((r) => (
              <li key={r.creatorId} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <Link href={`/admin/creators/${r.creatorId}`} className="font-medium hover:underline">{r.name}</Link>
                <span className={badge.amber}>{r.status === "NO_HANDLE" ? "sem @ no cadastro" : `@${r.handle}: pessoal, privado ou @ errado`}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card title="Posts que marcaram a marca" icon={<AtSign className="size-4" />}>
        {data.tags.length === 0 ? (
          <p className={ui.muted}>Nenhum post marcou a marca ainda (ou a primeira leitura não rodou).</p>
        ) : (
          <ul className={ui.list}>
            {data.tags.map((t) => (
              <li key={t.permalink} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <span className="flex flex-wrap items-center gap-2">
                  {t.creator ? <Link href={`/admin/creators/${t.creator.id}`} className="font-medium hover:underline">{t.creator.name}</Link> : <span className="font-medium">@{t.username}</span>}
                  {!t.creator && <span className={badge.neutral}>não é creator</span>}
                  <span className={ui.hint}>{date(t.postedAt)} · {n(t.likes ?? 0)} curtidas · {n(t.comments ?? 0)} comentários</span>
                </span>
                <a href={t.permalink} target="_blank" rel="noreferrer" className={ui.ghostSm}>Abrir post</a>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
