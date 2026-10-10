import { ArrowRight, Store } from "lucide-react";
import { chooseBrandAction } from "@/app/admin/actions";
import { PageHeader } from "@/components/ui/page";
import { badge, ui } from "@/components/ui/styles";
import { formatBRL } from "@/domain";
import { brandCssVars } from "@/lib/portal/context";
import type { allianceOverview } from "@/lib/staff/overview";
import type { CSSProperties } from "react";

type Brands = Awaited<ReturnType<typeof allianceOverview>>;

/** Um atalho: escolhe a marca e abre a tela. */
function Go({ slug, next, label, value, tone }: { slug: string; next: string; label: string; value: number | string; tone?: "amber" | "red" | undefined }) {
  const color = tone === "red" ? "text-red-700 dark:text-red-400" : tone === "amber" ? "text-amber-700 dark:text-amber-300" : "";
  return (
    <form action={chooseBrandAction}>
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="next" value={next} />
      <button className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm hover:bg-white/60 dark:hover:bg-white/10">
        <span>{label}</span>
        <span className={`flex items-center gap-1 font-semibold tabular-nums ${color}`}>{value}<ArrowRight className="size-3.5 text-stone-400" /></span>
      </button>
    </form>
  );
}

/** Visão geral da Alliance (A1, D-ALLIANCE): um cartão por marca; cada linha entra na marca já na tela certa. */
export function AllianceView({ brands }: { brands: Brands }) {
  return (
    <>
      <PageHeader title="Alliance">As marcas da Alliance no Creator Club. Escolha uma linha para entrar na marca já na tela certa.</PageHeader>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {brands.map((b) => {
          const c = b.home.creators;
          const w = b.home.withdrawals;
          const s = b.home.shipments;
          const k = b.home.coupons;
          return (
            <section key={b.id} style={brandCssVars(b) as CSSProperties} className={`${ui.card} border-t-4 border-t-[var(--brand)]`}>
              <div className="flex items-center justify-between gap-2">
                <h2 className="flex items-center gap-2 text-lg font-semibold">
                  <span className="grid size-8 place-content-center rounded-xl bg-brand text-sm text-white">{b.name.slice(0, 1)}</span>
                  {b.name}
                </h2>
                {b.store?.connected ? (
                  <span className={badge.green}><Store className="mr-1 inline size-3" />loja conectada</span>
                ) : (
                  <span className={badge.amber}><Store className="mr-1 inline size-3" />sem loja</span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs uppercase tracking-wide text-stone-500">Vendas do mês</p>
                  <p className="text-xl font-semibold tabular-nums">{formatBRL(b.salesCents).replace(/,00$/, "")}</p>
                  <p className={ui.hint}>{b.orders} {b.orders === 1 ? "pedido" : "pedidos"} com cupom</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-stone-500">Creators ativas</p>
                  <p className="text-xl font-semibold tabular-nums">{c?.active ?? 0}</p>
                  {c && c.idle > 0 && <p className={ui.hint}>{c.idle} sem vender há 60 dias</p>}
                </div>
              </div>
              <div className="flex flex-col">
                {c && <Go slug={b.slug} next="/admin/candidatas" label="Candidatas novas" value={c.applications} tone={c.applications ? "amber" : undefined} />}
                {c && <Go slug={b.slug} next="/admin/desempenho" label="Desempenho do mês" value="ver" />}
                {c && c.contractsExpiring + c.contractsExpired > 0 && (
                  <Go slug={b.slug} next="/admin/creators" label="Contratos vencendo ou vencidos" value={c.contractsExpiring + c.contractsExpired} tone="amber" />
                )}
                {k && k.unclassified + k.ownerPending > 0 && <Go slug={b.slug} next="/admin/cupons" label="Cupons a conferir" value={k.unclassified + k.ownerPending} tone="amber" />}
                {s && <Go slug={b.slug} next="/admin/envios" label="Envios preparando" value={s.preparing} tone={s.preparing ? "amber" : undefined} />}
                {w && <Go slug={b.slug} next="/admin/saques" label="Saques em aberto" value={w.open} tone={w.open ? "amber" : undefined} />}
                {!b.store?.connected && <Go slug={b.slug} next="/admin/sync" label="Conectar a loja Shopify" value="abrir" />}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}
