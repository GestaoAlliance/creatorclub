import { Bell, CalendarDays, ChevronDown, ChevronRight, Mail, Megaphone, MessageCircle, Package, ShoppingBag, Trophy, UserRound, Wallet } from "lucide-react";
import Link from "next/link";
import { ackNoticeAction } from "@/app/portal/[marca]/avisos/actions";
import { ui } from "@/components/ui/styles";
import { dayKey, noticeGroup, noticeTopic, type NoticeTopic } from "@/domain";
import type { portalNoticesBoard } from "@/lib/portal/notices-board";

type Board = Awaited<ReturnType<typeof portalNoticesBoard>>;
type Item = Board["list"][number];

const TOPIC: Record<NoticeTopic, { icon: typeof Bell; cls: string }> = {
  money: { icon: Wallet, cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" },
  sales: { icon: ShoppingBag, cls: "bg-brand/10 text-brand dark:bg-brand-2/15 dark:text-brand-2" },
  ship: { icon: Package, cls: "bg-sky-500/15 text-sky-700 dark:text-sky-300" },
  campaign: { icon: Trophy, cls: "bg-amber-400/20 text-amber-700 dark:text-amber-300" },
  team: { icon: Megaphone, cls: "bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-300" },
  account: { icon: UserRound, cls: "bg-stone-500/15 text-stone-600 dark:text-stone-300" },
};

function Icon({ kind }: { kind: string }) {
  const t = TOPIC[noticeTopic(kind)];
  const I = t.icon;
  return <span className={`grid size-8 shrink-0 place-content-center rounded-xl ${t.cls}`}><I className="size-4" /></span>;
}

/** Faixa: avisos novos, resumo do mês e o que pede ação agora (com atalho). */
export function NoticesHero({ b }: { b: Board }) {
  return (
    <section className="@container relative isolate overflow-hidden rounded-[32px] text-white shadow-[0_30px_60px_-34px_var(--brand)]">
      <div aria-hidden className="brand-art absolute inset-0 -z-10" />
      <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(80%_60%_at_50%_-20%,rgb(255_255_255/0.22),transparent_70%)]" />
      <div className="flex flex-col gap-4 p-5 md:p-7">
        <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-white/75"><Bell className="size-3.5" />Avisos</p>
        <div>
          <p className="text-2xl font-semibold leading-tight">{b.newCount ? `${b.newCount} ${b.newCount === 1 ? "aviso novo" : "avisos novos"}` : "Nenhum aviso novo"}</p>
          {b.summary && <p className="mt-1 text-sm text-white/80">Este mês: {b.summary}.</p>}
        </div>
        {b.actions.length > 0 ? (
          <div className="flex flex-col gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-white/75">Precisa de você</p>
            {b.actions.map((a) => (
              <Link key={a.id} href={a.href} className="frost-tile flex items-center gap-3 rounded-2xl px-3.5 py-3 text-sm font-medium text-stone-900 dark:text-white">
                <span className="min-w-0 flex-1">{a.label}</span>
                <ChevronRight className="size-4 shrink-0 text-stone-400" />
              </Link>
            ))}
          </div>
        ) : (
          <p className="text-sm text-white/80">Nada pendente com você agora. ✨</p>
        )}
      </div>
    </section>
  );
}

/** Recados da equipe fixados até "Entendi". */
export function Pinned({ b, marca }: { b: Board; marca: string | null }) {
  if (!b.pinned.length) return null;
  return (
    <div className="flex flex-col gap-3">
      {b.pinned.map((n) => (
        <section key={n.id} className="glass flex flex-col gap-3 rounded-3xl p-4 ring-2 ring-fuchsia-500/30 md:p-5">
          <div className="flex items-start gap-3">
            <Icon kind={n.kind} />
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-fuchsia-700 dark:text-fuchsia-300">Recado da equipe</p>
              <p className="font-semibold">{n.title}</p>
              <p className="mt-1 whitespace-pre-line text-sm text-stone-700 dark:text-stone-300">{n.body}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {marca && (
              <form action={ackNoticeAction}>
                <input type="hidden" name="marca" value={marca} />
                <input type="hidden" name="id" value={n.id} />
                <button className={ui.btn}>Entendi</button>
              </form>
            )}
            {n.href && <Link href={n.href} className={`${ui.link} text-sm`}>Abrir →</Link>}
          </div>
        </section>
      ))}
    </div>
  );
}

const when = (d: Date, tz: string) => d.toLocaleTimeString("pt-BR", { timeZone: tz, hour: "2-digit", minute: "2-digit" });
const dm = (d: Date, tz: string) => d.toLocaleDateString("pt-BR", { timeZone: tz, day: "2-digit", month: "2-digit" });

function Row({ n, tz, old }: { n: Item; tz: string; old: boolean }) {
  return (
    <details className="group/row border-t border-stone-200/70 first:border-0 dark:border-white/10">
      <summary className="flex cursor-pointer list-none items-center gap-3 py-2.5">
        <Icon kind={n.kind} />
        <span className="min-w-0 flex-1">
          <span className={`block truncate text-sm ${n.readAt ? "" : "font-semibold"}`}>{n.title}</span>
          <span className="block truncate text-xs text-stone-500">{n.body}</span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1">
          <span className="text-[11px] tabular-nums text-stone-500">{old ? dm(n.createdAt, tz) : when(n.createdAt, tz)}</span>
          {!n.readAt && <span className="size-2 rounded-full bg-brand dark:bg-brand-2" aria-label="novo" />}
        </span>
      </summary>
      <div className="flex flex-col gap-2 pb-3 pl-11 text-sm">
        <p className="whitespace-pre-line text-stone-700 dark:text-stone-300">{n.body}</p>
        {n.href && <Link href={n.href} className={`${ui.link} self-start`}>Abrir →</Link>}
      </div>
    </details>
  );
}

/** Lista por dia (últimos 30 dias à vista; os antigos recolhidos). */
export function NoticeList({ b }: { b: Board }) {
  if (!b.list.length && !b.pinned.length) return <section className={ui.card}><p className={ui.muted}>Nenhum aviso ainda. Quando sua comissão liberar, um kit chegar ou um saque for pago, aparece aqui.</p></section>;
  const groups = new Map<string, Item[]>();
  for (const n of b.list) {
    const g = noticeGroup(dayKey(n.createdAt, b.timeZone), b.today);
    groups.set(g, [...(groups.get(g) ?? []), n]);
  }
  const recent = [...groups].filter(([g]) => g !== "Antes");
  const older = groups.get("Antes") ?? [];
  return (
    <>
      {recent.length > 0 && (
        <section className="glass flex flex-col rounded-3xl px-4 py-2 md:px-5">
          {recent.map(([g, list]) => (
            <div key={g} className="py-2">
              <h2 className="pb-1 text-xs font-semibold uppercase tracking-wide text-stone-500">{g}</h2>
              {list.map((n) => <Row key={n.id} n={n} tz={b.timeZone} old={g !== "Hoje" && g !== "Ontem"} />)}
            </div>
          ))}
        </section>
      )}
      {older.length > 0 && (
        <details className="group glass flex flex-col rounded-3xl px-4 py-1 md:px-5">
          <summary className="flex cursor-pointer list-none items-center gap-2 py-3 text-sm font-semibold">
            <ChevronDown className="size-4 text-stone-400 transition-transform group-open:rotate-180" />
            <span className="flex-1">Ver avisos antigos</span>
            <span className="text-xs font-normal text-stone-500">{older.length}</span>
          </summary>
          <div className="pb-2">{older.map((n) => <Row key={n.id} n={n} tz={b.timeZone} old />)}</div>
        </details>
      )}
    </>
  );
}

/** Onde ela recebe os avisos (contato mascarado). */
export function Channel({ b }: { b: Board }) {
  const c = b.channel;
  return (
    <section className="glass flex items-start gap-3 rounded-3xl p-4 md:p-5">
      <span className="grid size-9 shrink-0 place-content-center rounded-2xl bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">{c?.kind === "EMAIL" ? <Mail className="size-4" /> : c ? <MessageCircle className="size-4" /> : <CalendarDays className="size-4" />}</span>
      <span className="min-w-0 text-sm">
        {c ? (
          <>Você recebe os avisos aqui e também {c.kind === "WHATSAPP" ? <>no WhatsApp <strong className="tabular-nums">{c.to}</strong></> : <>por e-mail em <strong>{c.to}</strong></>}.</>
        ) : (
          <>Por enquanto os avisos aparecem só aqui no portal.</>
        )}
        <span className="block text-xs text-stone-500">Número ou e-mail errado? Fale com a equipe da marca para corrigir.</span>
      </span>
    </section>
  );
}
