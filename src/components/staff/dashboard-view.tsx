import { AlertTriangle, ArrowDownRight, ArrowRight, ArrowUpRight, Minus, Sparkles, TrendingDown, TrendingUp } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { SalesChart } from "@/components/portal/sales-chart";
import { needsFor } from "@/lib/staff/needs";
import { Card } from "@/components/ui/page";
import { ui } from "@/components/ui/styles";
import { formatBRL } from "@/domain";
import { DASH_PRESETS, type DashCategory, type StaffDashboard } from "@/lib/staff/dashboard";
import type { StaffHome } from "@/lib/staff/home";
import type { BaseHealth, Cashflow } from "@/lib/staff/insights";
import type { ProductReport } from "@/lib/reports/products";
import { HideValuesToggle } from "./hide-values";

const dmy = (k: string) => `${k.slice(8, 10)}/${k.slice(5, 7)}`;
const pct = (v: number) => `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
const CATS: { id: DashCategory; label: string }[] = [
  { id: "", label: "Todos os tipos" },
  { id: "INFLUENCER", label: "Influencer" },
  { id: "UGC", label: "UGC" },
  { id: "PRESCRITOR", label: "Prescritor" },
];
const CAT_LABEL: Record<string, string> = { INFLUENCER: "Influencer", UGC: "UGC", PRESCRITOR: "Prescritor" };

/** Valor em dinheiro que some quando o "olho" está fechado (classe `money`). */
export const M = ({ children }: { children: ReactNode }) => <span className="money">{children}</span>;

export function Change({ v }: { v: number | null }) {
  if (v === null) return <span className="text-xs text-stone-500">sem base anterior</span>;
  const Icon = v > 0 ? ArrowUpRight : v < 0 ? ArrowDownRight : Minus;
  const tone = v > 0 ? "text-emerald-700 dark:text-emerald-400" : v < 0 ? "text-red-700 dark:text-red-400" : "text-stone-500";
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-semibold ${tone}`}>
      <Icon className="size-3.5" />
      {v > 0 ? "+" : ""}
      {v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%
    </span>
  );
}

export function Stat({ label, value, change, hint }: { label: string; value: ReactNode; change: number | null; hint: ReactNode }) {
  return (
    <div className={`${ui.card} gap-2`}>
      <p className="text-xs font-medium uppercase tracking-wide text-stone-500">{label}</p>
      <p className="text-3xl font-semibold tabular-nums">{value}</p>
      <div className="flex flex-wrap items-center gap-2">
        <Change v={change} />
        <span className={ui.hint}>{hint}</span>
      </div>
    </div>
  );
}

/**
 * "Sua fila" (regra em `needsFor`, D-NEEDSAREA): coluna à direita que acompanha a rolagem (no celular, em cima).
 * O urgente vem em cartões vermelhos; o resto em lista por área, cada linha com o atalho para a tela.
 */
function QueueRail({ h }: { h: StaffHome }) {
  const { readOnly, areas } = needsFor(h);
  const urgent = areas.flatMap((a) => a.items.filter((i) => i.urgent).map((i) => ({ ...i, area: a.area })));
  const total = areas.reduce((n, a) => n + a.items.length, 0);
  return (
    <aside aria-label={readOnly ? "Pendências da equipe" : "Sua fila"} className="glass flex flex-col gap-4 rounded-[28px] p-5 xl:sticky xl:top-6">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold">{readOnly ? "Pendências da equipe" : "Sua fila"}</h2>
        <span className="text-xs text-stone-500">{total === 0 ? "tudo em dia" : `${total} ${total === 1 ? "assunto" : "assuntos"}`}</span>
      </div>
      {total === 0 && <p className={ui.muted}>Nada esperando por você agora.</p>}
      {urgent.length > 0 && (
        <ul className="flex flex-col gap-2">
          {urgent.map((i) => (
            <li key={i.label}>
              <Link href={i.href} className="group flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50/90 p-3 transition-colors hover:bg-red-100 dark:border-red-900/60 dark:bg-red-950/40 dark:hover:bg-red-950/60">
                <span className="grid size-9 shrink-0 place-content-center rounded-xl bg-red-600 text-sm font-bold tabular-nums text-white">{i.n}</span>
                <span className="min-w-0 flex-1 text-sm">
                  <span className="block font-medium text-red-950 dark:text-red-100">{i.label}</span>
                  <span className="block text-xs text-red-800 dark:text-red-300">{i.note ?? i.area}</span>
                </span>
                <ArrowRight className="mt-1 size-3.5 shrink-0 text-red-400 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </li>
          ))}
        </ul>
      )}
      {areas.map((a) => {
        const rest = a.items.filter((i) => !i.urgent);
        if (rest.length === 0) return null;
        return (
          <div key={a.area} className="flex flex-col gap-1">
            {areas.length > 1 && <p className="px-1 text-xs font-medium text-stone-500">{a.area}</p>}
            <ul className="flex flex-col">
              {rest.map((i) => (
                <li key={i.label}>
                  <Link href={i.href} className="group flex items-center gap-3 rounded-xl px-2 py-1.5 text-sm transition-colors hover:bg-[color-mix(in_srgb,var(--brand)_8%,transparent)]">
                    <strong className="w-7 shrink-0 text-right tabular-nums text-brand dark:text-brand-2">{i.n}</strong>
                    <span className="min-w-0 flex-1 truncate">{i.label}</span>
                    <ArrowRight className="size-3.5 shrink-0 text-stone-300 transition-transform group-hover:translate-x-0.5 group-hover:text-brand" />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </aside>
  );
}

/** Número principal da faixa da marca (texto branco sobre a cor da marca). O tamanho acompanha a largura do cartão. */
function HeroStat({ label, value, change, hint }: { label: string; value: ReactNode; change: number | null; hint: ReactNode }) {
  const up = change !== null && change > 0;
  const down = change !== null && change < 0;
  return (
    <div className="@container flex min-w-0 flex-col gap-2 rounded-2xl bg-white/10 p-4 ring-1 ring-white/15 backdrop-blur-sm">
      <p className="text-sm leading-snug text-white/75">{label}</p>
      <p className="whitespace-nowrap text-[clamp(0.95rem,12.5cqi,1.75rem)] font-semibold leading-none tabular-nums text-white">{value}</p>
      <div className="mt-auto flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-white/70">
        {change === null ? (
          <span className="shrink-0">sem base anterior</span>
        ) : (
          <span className={`inline-flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-0.5 font-semibold ${up ? "bg-[var(--brand-2)] text-[var(--brand)]" : down ? "bg-white/90 text-red-700" : "bg-white/20 text-white"}`}>
            {up ? <ArrowUpRight className="size-3" /> : down ? <ArrowDownRight className="size-3" /> : <Minus className="size-3" />}
            {up ? "+" : ""}
            {change.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%
          </span>
        )}
        <span className="min-w-0">{hint}</span>
      </div>
    </div>
  );
}

/** Top creators do período (barra pelo valor; clicar abre a ficha). Usado no Início e em Vendas. */
export function TopCreatorsCard({ d }: { d: StaffDashboard }) {
  const maxCreator = Math.max(1, ...d.topCreators.map((c) => c.salesCents));
  return (
    <Card title="Top creators">
      {d.topCreators.length === 0 ? (
        <p className={ui.muted}>Nenhuma venda de creator no período.</p>
      ) : (
        <>
          <p className={ui.hint}>A maior faz {pct(d.concentration.top1)} das vendas de creators · as 3 maiores, {pct(d.concentration.top3)}.</p>
          <ol className="flex flex-col gap-3">
            {d.topCreators.map((c, i) => (
              <li key={c.id}>
                <Link href={`/admin/creators/${c.id}`} className="group flex flex-col gap-1">
                  <span className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate">
                      <span className="mr-2 tabular-nums text-stone-400">{i + 1}</span>
                      <span className="font-medium group-hover:underline">{c.name}</span>
                      <span className="ml-1.5 text-xs text-stone-500">{c.categories.map((x) => CAT_LABEL[x]).join(" · ")}</span>
                    </span>
                    <span className="shrink-0 tabular-nums">
                      <M>{formatBRL(c.salesCents)}</M> <span className="text-xs text-stone-500">· {c.orders} ped.</span>
                    </span>
                  </span>
                  <span className="h-1.5 overflow-hidden rounded-full bg-stone-300/40 dark:bg-white/10">
                    <span className="block h-full rounded-full bg-brand" style={{ width: `${(c.salesCents / maxCreator) * 100}%` }} />
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </>
      )}
    </Card>
  );
}

/** D-HOMEINSIGHTS: em que ponto do caminho está a base (agora), com o tempo até a primeira venda. */
function HealthCard({ h }: { h: BaseHealth }) {
  const steps = [
    { label: "Candidatas", n: h.applications, href: "/admin/candidatas", hint: "esperando aprovação" },
    { label: "Assinando", n: h.awaitingSignature, href: "/admin/candidatas?ver=WAITING", hint: "aprovadas, sem assinar" },
    { label: "Vendendo", n: h.selling, href: "/admin/creators", hint: "venda nos últimos 30 dias", good: true },
    { label: "Paradas", n: h.stopped, href: "/admin/creators/acoes?tipo=IDLE", hint: "venderam antes, nada em 30 dias", bad: true },
    { label: "Nunca venderam", n: h.neverSold, href: "/admin/creators?semvenda=1", hint: "ativas sem nenhuma venda", bad: true },
  ];
  const sellingShare = h.active ? h.selling / h.active : 0;
  return (
    <Card title="Saúde da base de creators">
      <div className="flex flex-col gap-4">
        <div>
          <div className="flex items-baseline justify-between gap-2 text-sm">
            <span>
              <strong className="text-2xl font-semibold tabular-nums text-brand">{pct(sellingShare)}</strong> das {h.active} ativas venderam nos últimos 30 dias
            </span>
            {h.medianDaysToFirstSale !== null && <span className={ui.hint}>1ª venda em ~{h.medianDaysToFirstSale} dias depois de entrar</span>}
          </div>
          <div className="mt-2 flex h-2.5 overflow-hidden rounded-full bg-stone-300/40 dark:bg-white/10">
            <span className="h-full bg-brand" style={{ width: `${(h.selling / Math.max(1, h.active)) * 100}%` }} />
            <span className="h-full bg-amber-400/80" style={{ width: `${(h.stopped / Math.max(1, h.active)) * 100}%` }} />
            <span className="h-full bg-red-400/70" style={{ width: `${(h.neverSold / Math.max(1, h.active)) * 100}%` }} />
          </div>
        </div>
        <div className="@container">
        <div className="grid grid-cols-2 gap-2 @lg:grid-cols-3 @3xl:grid-cols-5">
          {steps.map((x) => (
            <Link key={x.label} href={x.href} className="group rounded-2xl border border-stone-200/80 p-3 transition-colors hover:bg-stone-100/70 dark:border-white/10 dark:hover:bg-white/5">
              <p className="text-xs text-stone-500">{x.label}</p>
              <p className={`text-2xl font-semibold tabular-nums ${x.good ? "text-brand" : x.bad && x.n > 0 ? "text-red-700 dark:text-red-300" : ""}`}>{x.n}</p>
              <p className="text-[11px] leading-tight text-stone-500">{x.hint}</p>
            </Link>
          ))}
        </div>
        </div>
      </div>
    </Card>
  );
}

/** D-HOMEINSIGHTS + D-COST: retorno do programa no período (custo dos produtos vindo da Shopify). */
function ReturnCard({ p, missing }: { p: NonNullable<ProductReport["program"]>; missing: number }) {
  const invested = p.commissionCents + p.kitsCents + p.freightCents;
  const ratio = invested > 0 ? p.revenueCents / invested : null;
  const rows = [
    { label: "Comissão", v: p.commissionCents },
    { label: "Produtos enviados às creators", v: p.kitsCents },
    { label: "Frete dos envios", v: p.freightCents },
    { label: "Custo dos produtos vendidos", v: p.cogsCents },
  ];
  return (
    <Card title="Retorno do programa">
      <div className="flex flex-col gap-3">
        <p className="text-sm">
          {ratio === null ? (
            "Sem investimento no período."
          ) : (
            <>
              Cada <strong>R$ 1</strong> investido (comissão, produtos enviados e frete) trouxe{" "}
              <strong className="text-2xl font-semibold tabular-nums text-brand"><M>R$ {ratio.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}</M></strong> em vendas.
            </>
          )}
        </p>
        <ul className="flex flex-col gap-1 text-sm">
          {rows.map((r) => (
            <li key={r.label} className="flex justify-between gap-3">
              <span className="text-stone-600 dark:text-stone-300">{r.label}</span>
              <span className="tabular-nums"><M>{formatBRL(r.v)}</M></span>
            </li>
          ))}
          <li className="mt-1 flex justify-between gap-3 border-t border-stone-200/70 pt-2 font-semibold dark:border-white/10">
            <span>Lucro do programa</span>
            <span className={`tabular-nums ${p.profitCents < 0 ? "text-red-700 dark:text-red-300" : "text-brand"}`}><M>{formatBRL(p.profitCents)}</M></span>
          </li>
        </ul>
        {(missing > 0 || p.shipmentsWithoutFreight > 0 || p.kitUnitsWithoutCost > 0) && (
          <p className={ui.hint}>
            Conta incompleta:{" "}
            {[
              missing > 0 && `${missing} produtos sem custo na Shopify`,
              p.kitUnitsWithoutCost > 0 && `${p.kitUnitsWithoutCost} unidades enviadas sem custo`,
              p.shipmentsWithoutFreight > 0 && `${p.shipmentsWithoutFreight} envios sem frete`,
            ]
              .filter(Boolean)
              .join(" · ")}
            . <Link href="/admin/vendas/produtos" className="underline">Ver detalhes</Link>
          </p>
        )}
      </div>
    </Card>
  );
}

/** D-HOMEINSIGHTS: caixa do Pagamento (o que vai sair nas próximas semanas). */
function CashCard({ c }: { c: Cashflow }) {
  const rows = [
    { label: "A liberar no dia 1", v: c.heldCents, hint: "comissão do mês, se bater o mínimo" },
    { label: "Disponível para saque", v: c.availableCents, hint: `${c.availableCreators} creators podem pedir` },
    { label: "Saques pedidos", v: c.requested.cents, hint: `${c.requested.count} para conferir` },
    { label: "Aprovados a pagar", v: c.approved.cents, hint: `${c.approved.count} no prazo de pagamento` },
  ];
  return (
    <Card title="Caixa das comissões">
      <ul className="flex flex-col divide-y divide-stone-200/70 dark:divide-white/10">
        {rows.map((r) => (
          <li key={r.label} className="flex items-baseline justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
            <span className="min-w-0">
              <span className="block text-sm">{r.label}</span>
              <span className={ui.hint}>{r.hint}</span>
            </span>
            <strong className="shrink-0 tabular-nums"><M>{formatBRL(r.v)}</M></strong>
          </li>
        ))}
      </ul>
      {c.lockedCents > 0 && (
        <p className={`${ui.hint} mt-2`}>
          + <M>{formatBRL(c.lockedCents)}</M> liberados de quem ainda espera o saldo de abertura.{" "}
          <Link href="/admin/abertura" className="underline">Aprovar</Link>
        </p>
      )}
    </Card>
  );
}

/** D-HOMEINSIGHTS: quem subiu, quem caiu e quem vendeu pela primeira vez, com o alerta de concentração. */
function MovementsCard({ d, h }: { d: StaffDashboard; h: BaseHealth | null }) {
  const m = d.movements;
  const row = (x: { id: string; name: string; nowCents: number; beforeCents: number; deltaCents: number }, up: boolean) => (
    <li key={x.id}>
      <Link href={`/admin/creators/${x.id}`} className="group flex items-baseline justify-between gap-3 py-1.5 text-sm">
        <span className="min-w-0 truncate group-hover:underline">{x.name}</span>
        <span className={`shrink-0 tabular-nums font-semibold ${up ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"}`}>
          {up ? "+" : "−"}<M>{formatBRL(Math.abs(x.deltaCents))}</M>
        </span>
      </Link>
    </li>
  );
  const col = (title: string, icon: ReactNode, children: ReactNode, empty: string, has: boolean) => (
    <div className="flex flex-col gap-1">
      <p className="flex items-center gap-1.5 text-sm font-medium text-stone-600 dark:text-stone-300">{icon}{title}</p>
      {has ? <ul className="divide-y divide-stone-200/60 dark:divide-white/10">{children}</ul> : <p className={ui.muted}>{empty}</p>}
    </div>
  );
  return (
    <Card title="Movimentos do período">
      <div className="flex flex-col gap-4">
        {d.concentration.alert && (
          <p className="flex items-start gap-2 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <span>
              <strong>Dependência alta:</strong> a maior creator faz {pct(d.concentration.top1)} das vendas de creators (as 3 maiores, {pct(d.concentration.top3)}). Vale ativar mais creators para diluir o risco.
            </span>
          </p>
        )}
        <div className="grid gap-6 sm:grid-cols-3">
          {col("Subindo", <TrendingUp className="size-3.5 text-emerald-600" />, m.rising.map((x) => row(x, true)), "Ninguém cresceu contra o período anterior.", m.rising.length > 0)}
          {col("Caindo", <TrendingDown className="size-3.5 text-red-600" />, m.falling.map((x) => row(x, false)), "Ninguém caiu forte.", m.falling.length > 0)}
          {col(
            `Primeira venda${h && h.firstSaleCount > 0 ? ` (${h.firstSaleCount})` : ""}`,
            <Sparkles className="size-3.5 text-brand" />,
            (h?.firstSales ?? []).map((x) => (
              <li key={x.id}>
                <Link href={`/admin/creators/${x.id}`} className="group flex items-baseline justify-between gap-3 py-1.5 text-sm">
                  <span className="min-w-0 truncate group-hover:underline">{x.name}</span>
                  <span className="shrink-0 text-xs text-stone-500">{x.day.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" })}</span>
                </Link>
              </li>
            )),
            "Nenhuma creator nova vendeu no período.",
            (h?.firstSales.length ?? 0) > 0,
          )}
        </div>
      </div>
    </Card>
  );
}

const href = (p: { periodo?: string; tipo?: string }) => {
  const s = new URLSearchParams(Object.entries(p).filter(([, v]) => v) as [string, string][]).toString();
  return `/admin/marca${s ? `?${s}` : ""}`;
};

/** Início com o dashboard (M0.0.4, modelo da referência), para quem vê dinheiro na marca. */
export function DashboardView({
  d,
  h,
  category,
  brandName,
  health = null,
  cash = null,
  program = null,
  productsWithoutCost = 0,
}: {
  d: StaffDashboard;
  h: StaffHome;
  category: DashCategory;
  brandName: string;
  health?: BaseHealth | null;
  cash?: Cashflow | null;
  program?: ProductReport["program"];
  productsWithoutCost?: number;
}) {
  const k = d.kpis;
  const maxUnits = Math.max(1, ...d.topProducts.map((p) => p.units));
  return (
    <div className="dash grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
      <div className="@container order-2 flex min-w-0 flex-col gap-6 xl:order-1">
      {/* D-HOMEINSIGHTS: faixa da marca (cor do banco) com o período e os números principais. */}
      <section
        className="relative overflow-hidden rounded-[28px] p-6 text-white shadow-[0_20px_50px_-24px_var(--brand)]"
        style={{ background: "linear-gradient(135deg, var(--brand) 0%, color-mix(in srgb, var(--brand) 78%, #000) 100%)" }}
      >
        <span aria-hidden className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full opacity-30 blur-3xl" style={{ background: "var(--brand-2)" }} />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Início da {brandName}</h1>
            <p className="text-sm text-white/75">
              {dmy(d.period.from)} a {dmy(d.period.to)}, comparado com {dmy(d.previous.from)} a {dmy(d.previous.to)}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {DASH_PRESETS.map((p) => (
              <Link
                key={p.id}
                href={href({ periodo: p.id, tipo: category })}
                className={`rounded-full px-3 py-1 text-xs transition-colors ${d.period.preset === p.id ? "bg-white font-semibold text-[var(--brand)]" : "bg-white/10 text-white ring-1 ring-white/20 hover:bg-white/20"}`}
              >
                {p.label}
              </Link>
            ))}
            <form action="/admin/marca" className="flex items-center gap-1">
              <select name="tipo" defaultValue={category} className="rounded-full border-0 bg-white/10 px-3 py-1 text-xs text-white ring-1 ring-white/20 [&>option]:text-stone-900" aria-label="Tipo de creator">
                {CATS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
              {d.period.preset && <input type="hidden" name="periodo" value={d.period.preset} />}
              <button className="rounded-full bg-white/10 px-3 py-1 text-xs text-white ring-1 ring-white/20 hover:bg-white/20">Aplicar</button>
            </form>
            <span className="rounded-full bg-white/90 text-stone-900"><HideValuesToggle /></span>
          </div>
        </div>
        <div className="relative mt-5 grid grid-cols-2 gap-3 @3xl:grid-cols-4">
          <HeroStat label="Vendas de creators" value={<M>{formatBRL(k.sales.cents)}</M>} change={k.sales.change} hint={<>{pct(k.sales.storeShare)} da loja</>} />
          <HeroStat label="Comissão gerada" value={<M>{formatBRL(k.commission.cents)}</M>} change={k.commission.change} hint={<>{pct(k.commission.rate)} das vendas</>} />
          <HeroStat label="Creators vendendo" value={k.creators.sold} change={k.creators.change} hint={<>de {k.creators.active} ativas</>} />
          <HeroStat label="Produtos vendidos" value={k.units.count} change={k.units.change} hint={<>{k.sales.orders} pedidos</>} />
        </div>
      </section>

      {/* Pedido do responsável (2026-10-26): o Início da marca mostra só as vendas de creators (sem a loja inteira). */}
      <Card title="Vendas de creators por dia">
        <div className="money-chart">
          <SalesChart days={d.days} previous={d.prevDays} bands={d.campaigns} />
        </div>
      </Card>

      {health && <HealthCard h={health} />}

      {(program || cash) && (
        <div className={`grid gap-6 ${program && cash ? "@3xl:grid-cols-2" : ""}`}>
          {program && <ReturnCard p={program} missing={productsWithoutCost} />}
          {cash && <CashCard c={cash} />}
        </div>
      )}

      <MovementsCard d={d} h={health} />

      <div className="grid gap-6 @3xl:grid-cols-2">
        <TopCreatorsCard d={d} />
        <Card title="Top produtos com cupom de creator">
          {d.topProducts.length === 0 ? (
            <p className={ui.muted}>Nenhum produto vendido com cupom de creator no período.</p>
          ) : (
            <ol className="flex flex-col gap-3">
              {d.topProducts.map((p, i) => (
                <li key={p.title} className="flex flex-col gap-1">
                  <span className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate">
                      <span className="mr-2 tabular-nums text-stone-400">{i + 1}</span>
                      <span className="font-medium">{p.title}</span>
                    </span>
                    <span className="shrink-0 tabular-nums">
                      {p.units} un. <span className="text-xs text-stone-500">· <M>{formatBRL(p.salesCents)}</M></span>
                    </span>
                  </span>
                  <span className="h-1.5 overflow-hidden rounded-full bg-stone-300/40 dark:bg-white/10">
                    <span className="block h-full rounded-full bg-brand" style={{ width: `${(p.units / maxUnits) * 100}%` }} />
                  </span>
                </li>
              ))}
            </ol>
          )}
          {d.giftUnits > 0 && <p className={`${ui.hint} mt-3`}>Fora do ranking: {d.giftUnits} brindes enviados junto com os pedidos.</p>}
        </Card>
      </div>
      </div>
      <div className="order-1 xl:order-2">
        <QueueRail h={h} />
      </div>
    </div>
  );
}
