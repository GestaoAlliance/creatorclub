import { History } from "lucide-react";
import Link from "next/link";
import type { Actor } from "@/lib/auth/actor";
import { auditLabel } from "@/domain";
import { db } from "@/lib/db";
import { recentChanges, settingsHealth } from "@/lib/settings/health";

const dt = (d: Date | null) => (d ? d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "nunca");

type Tab = "marcas" | "equipe" | "contratos" | "termo" | "sync" | "importar" | "claude";

/**
 * Faixa das Configurações (D-SETTINGSBOARD): título da aba e quadros de saúde da marca escolhida no topo (marca, loja,
 * equipe, termo, contratos). Cada quadro abre a aba dele; quem não pode abrir a aba não vê o quadro.
 */
export async function SettingsHero({ actor, brandId, brandName, active, title, children }: { actor: Actor; brandId: string | null; brandName: string; active: Tab; title: string; children?: React.ReactNode }) {
  const h = brandId ? await settingsHealth(db(), actor, brandId) : null;
  const done = h ? h.checklist.filter((c) => c.done).length : 0;
  const tiles = h
    ? [
        ...(h.admin ? [{ tab: "marcas", href: "/admin/marcas", label: "Marca", value: `${done}/${h.checklist.length}`, hint: done === h.checklist.length ? "tudo pronto" : `falta: ${h.checklist.filter((c) => !c.done)[0]!.label.toLowerCase()}`, dot: done === h.checklist.length ? "seg-good" : "seg-warn" }] : []),
        ...(h.integrations ? [{ tab: "sync", href: "/admin/sync", label: "Loja Shopify", value: h.shopify.connected ? "conectada" : "desligada", hint: h.shopify.failed24h ? `${h.shopify.failed24h} falhas em 24 h` : `sincronizou ${dt(h.shopify.lastSyncAt)}`, dot: !h.shopify.connected || h.shopify.failed24h ? "seg-bad" : "seg-good" }] : []),
        ...(h.admin ? [{ tab: "equipe", href: "/admin/equipe", label: "Equipe", value: String(h.team.people), hint: h.team.invites ? `${h.team.invites} ${h.team.invites === 1 ? "convite pendente" : "convites pendentes"}` : "nenhum convite pendente", dot: h.team.invites ? "seg-warn" : "seg-info" }] : []),
        ...(h.admin ? [{ tab: "termo", href: "/admin/termo", label: "Termo", value: h.terms.version ? `v${h.terms.version}` : "—", hint: h.terms.version ? `${h.terms.accepted} de ${h.terms.creators} aceitaram` : "nenhum publicado", dot: h.terms.version ? (h.terms.accepted < h.terms.creators ? "seg-warn" : "seg-good") : "seg-bad" }] : []),
        ...(h.admin ? [{ tab: "contratos", href: "/admin/contratos", label: "Contratos", value: `${h.contracts.kinds} ${h.contracts.kinds === 1 ? "tipo" : "tipos"}`, hint: h.contracts.waiting ? `${h.contracts.waiting} esperando assinar` : "ninguém esperando", dot: h.contracts.kinds === 0 ? "seg-bad" : h.contracts.waiting ? "seg-warn" : "seg-good" }] : []),
      ]
    : [];
  return (
    <section className="@container relative isolate overflow-hidden rounded-[32px] text-white shadow-[0_30px_60px_-34px_var(--brand)]">
      <div aria-hidden className="brand-art absolute inset-0 -z-10" />
      <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(80%_60%_at_50%_-20%,rgb(255_255_255/0.22),transparent_70%)]" />
      <div className="flex flex-col gap-5 p-5 md:p-7">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-white/70">Configurações · {brandName}</p>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{title}</h1>
          {children && <div className="mt-1 max-w-2xl text-sm text-white/80">{children}</div>}
        </div>
        {tiles.length > 0 && (
          <div className={`grid grid-cols-2 gap-2 ${tiles.length >= 5 ? "@3xl:grid-cols-3 @5xl:grid-cols-5" : "@3xl:grid-cols-4"}`}>
            {tiles.map((t) => (
              <Link key={t.tab} href={t.href} aria-current={active === t.tab ? "page" : undefined} className={`seg-tile frost-tile flex min-w-0 flex-col items-start gap-0.5 rounded-2xl px-3.5 py-3 text-left text-stone-900 dark:text-white ${active === t.tab ? "is-on" : ""}`}>
                <span className="flex w-full items-center justify-between gap-2 text-[11px] font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-300"><span className="truncate">{t.label}</span><span className={`seg-dot ${t.dot}`} /></span>
                <span className="max-w-full truncate text-xl font-semibold tabular-nums leading-tight">{t.value}</span>
                <span className="w-full truncate text-[11px] text-stone-500 dark:text-stone-300">{t.hint}</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

/** Últimas mudanças da aba (auditoria): quem mudou o quê e quando. */
export async function HistoryCard({ brandId, prefixes }: { brandId: string | null; prefixes: readonly string[] }) {
  const rows = await recentChanges(db(), brandId, prefixes);
  return (
    <section className="glass flex flex-col gap-2 rounded-3xl p-4">
      <h3 className="flex items-center gap-1.5 text-sm font-semibold"><History className="size-4" />Últimas mudanças</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-stone-500">Nenhuma mudança registrada ainda.</p>
      ) : (
        <ul className="divide-y divide-stone-200/70 text-sm dark:divide-white/10">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 py-2">
              <span className="min-w-0">{auditLabel(r.action)} <span className="text-stone-500">· {r.who}</span></span>
              <span className="shrink-0 text-xs tabular-nums text-stone-500">{dt(r.at)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
