import { Camera, TrendingDown } from "lucide-react";
import { Card } from "@/components/ui/page";
import { badge, ui } from "@/components/ui/styles";
import { IG_FORMAT_LABEL } from "@/domain";
import type { creatorInstagram } from "@/lib/instagram/ranking";

type Ig = NonNullable<Awaited<ReturnType<typeof creatorInstagram>>>;

const n = (v: number) => v.toLocaleString("pt-BR");
const pct = (bps: number) => `${(bps / 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
const date = (d: Date | string) => new Date(d).toLocaleDateString("pt-BR", { timeZone: typeof d === "string" ? "UTC" : "America/Sao_Paulo", day: "2-digit", month: "2-digit" });

/** Linha dos seguidores nas leituras (até 90 dias). */
function FollowersLine({ points }: { points: { day: string; followers: number }[] }) {
  if (points.length < 2) return null;
  const min = Math.min(...points.map((p) => p.followers));
  const max = Math.max(...points.map((p) => p.followers));
  const span = max - min || 1;
  const d = points.map((p, i) => `${i ? "L" : "M"}${((i / (points.length - 1)) * 300).toFixed(1)},${(56 - ((p.followers - min) / span) * 52).toFixed(1)}`).join(" ");
  return (
    <figure className="flex flex-col gap-1">
      <svg viewBox="0 0 300 60" preserveAspectRatio="none" className="h-16 w-full" role="img" aria-label={`Seguidores de ${n(points[0]!.followers)} para ${n(points.at(-1)!.followers)}`}>
        <path d={d} fill="none" stroke="var(--brand)" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      </svg>
      <figcaption className={ui.hint}>
        {date(points[0]!.day)}: {n(points[0]!.followers)} → {date(points.at(-1)!.day)}: {n(points.at(-1)!.followers)}
      </figcaption>
    </figure>
  );
}

/** D-INSTAGRAM: quadro "Instagram" da ficha (só equipe). */
export function InstagramCard({ ig }: { ig: Ig }) {
  return (
    <Card title="Instagram" icon={<Camera className="size-4" />}>
      {!ig.handle ? (
        <p className={ui.muted}>Sem @ do Instagram no cadastro.</p>
      ) : ig.status === null ? (
        <p className={ui.muted}>@{ig.handle} ainda não foi lido (a leitura roda todo dia a partir das 4h).</p>
      ) : ig.status === "UNREADABLE" ? (
        <p className={ui.muted}>@{ig.handle}: a Meta não mostra este perfil (pessoal, privado ou @ errado). Peça para trocar para conta de Criador de conteúdo.</p>
      ) : (
        <>
          <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
            <a href={`https://instagram.com/${ig.handle}`} target="_blank" rel="noreferrer" className="font-medium hover:underline">@{ig.handle}</a>
            <span><span className="text-xl font-semibold tabular-nums">{n(ig.followers ?? 0)}</span> <span className={ui.hint}>seguidores</span></span>
            <span><span className="font-semibold tabular-nums">{ig.engagementBps !== null ? pct(ig.engagementBps) : "—"}</span> <span className={ui.hint}>engajamento</span></span>
            <span><span className="font-semibold tabular-nums">{((ig.postsPerWeekX100 ?? 0) / 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}</span> <span className={ui.hint}>posts/semana</span></span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {ig.best && <span className={badge.neutral}>{IG_FORMAT_LABEL[ig.best.format]} engaja mais</span>}
            {ig.drop?.alert && <span className={`${badge.amber} inline-flex items-center gap-1`}><TrendingDown className="size-3" /> engajamento caiu {pct(ig.drop.dropBps)} em 30 dias</span>}
          </div>
          <FollowersLine points={ig.history} />
          {ig.posts.length > 0 && (
            <ul className={ui.list}>
              {ig.posts.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="tabular-nums">{date(p.postedAt)}</span>
                    <span className={ui.hint}>{n(p.likes ?? 0)} curtidas · {n(p.comments ?? 0)} comentários</span>
                    {p.hasCoupon && <span className={badge.green}>cita o cupom</span>}
                  </span>
                  <a href={p.permalink} target="_blank" rel="noreferrer" className={ui.ghostSm}>Abrir</a>
                </li>
              ))}
            </ul>
          )}
          <p className={ui.hint}>Última leitura: {ig.readAt?.split("-").reverse().join("/")}.</p>
        </>
      )}
    </Card>
  );
}
