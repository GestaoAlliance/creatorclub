import Link from "next/link";
import { redirect } from "next/navigation";
import { M } from "@/components/staff/dashboard-view";
import { HideValuesToggle } from "@/components/staff/hide-values";
import { Card, Kpi, PageHeader } from "@/components/ui/page";
import { ui } from "@/components/ui/styles";
import { formatBRL } from "@/domain";
import { can } from "@/lib/auth/permissions";
import { currentActor } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { productReport, type ProductScope } from "@/lib/reports/products";
import { staffContext } from "@/lib/staff/context";
import { DASH_PRESETS, dashPeriod } from "@/lib/staff/dashboard";

export const dynamic = "force-dynamic";

type Search = { periodo?: string; de?: string; ate?: string; ver?: string };
const dmy = (k: string) => `${k.slice(8, 10)}/${k.slice(5, 7)}`;
const pct = (part: number, whole: number) => (whole ? `${((part / whole) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%` : "—");
const qs = (sp: Search, change: Partial<Search>) => {
  const next = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...sp, ...change })) if (v) next.set(k, v);
  const s = next.toString();
  return s ? `?${s}` : "";
};

// Produtos e custo (M3.2, D-COST): receita, pedidos e unidades por produto, custo da Shopify, margem e o lucro do
// programa de creators no período.
export default async function ProductsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const actor = await currentActor();
  if (!actor) redirect("/entrar?next=/admin/vendas/produtos");
  const { brand } = await staffContext(actor);
  if (!brand) return <p className={ui.muted}>Nenhuma marca.</p>;
  if (!can(actor.grants, "money.view", brand.id)) redirect("/conta");
  const sp = await searchParams;
  const { timezone } = await db().brand.findUniqueOrThrow({ where: { id: brand.id }, select: { timezone: true } });
  const period = dashPeriod(sp, timezone);
  const scope: ProductScope = sp.ver === "loja" ? "loja" : "creators";
  const r = await productReport(db(), brand.id, period, scope);
  const p = r.program;
  const noCost = r.productsWithCost === 0;

  return (
    <>
      <PageHeader title="Produtos e custo">
        {scope === "creators" ? "Vendas com cupom de creator" : "Todas as vendas da loja"} de {dmy(period.from)} a {dmy(period.to)}: receita, unidades,
        custo (cadastrado na Shopify) e margem de cada produto{scope === "creators" ? ", e quanto o programa de creators deixa de lucro" : ""}.
      </PageHeader>
      <div className="flex flex-wrap items-center gap-2">
        {DASH_PRESETS.map((x) => (
          <Link key={x.id} href={qs(sp, { periodo: x.id, de: "", ate: "" })} className={period.preset === x.id ? ui.pillOn : ui.pill}>{x.label}</Link>
        ))}
        <span className="mx-1 h-5 w-px bg-stone-300 dark:bg-white/15" />
        <Link href={qs(sp, { ver: "" })} className={scope === "creators" ? ui.pillOn : ui.pill}>Com cupom de creator</Link>
        <Link href={qs(sp, { ver: "loja" })} className={scope === "loja" ? ui.pillOn : ui.pill}>Loja inteira</Link>
        <span className="ml-auto"><HideValuesToggle /></span>
      </div>
      {noCost && (
        <p role="status" className="rounded-2xl border border-amber-400/60 bg-amber-100/80 px-4 py-3 text-sm text-amber-950 dark:bg-amber-900/40 dark:text-amber-100">
          Nenhum produto da {brand.name} tem custo ainda. O custo vem da Shopify (campo &quot;Custo por item&quot; do produto) e precisa da permissão
          <code className="mx-1">read_inventory</code> no app do Creator Club da loja; depois, em Configurações → Shopify, &quot;Atualizar catálogo&quot;.
        </p>
      )}
      {p && (
        <Card title="Lucro do programa de creators" help="pr-lucro">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
            <Kpi label="Receita" value={<M>{formatBRL(p.revenueCents)}</M>} hint={`${r.totals.orders} pedidos com cupom`} />
            <Kpi label="Custo dos produtos" value={<M>{formatBRL(p.cogsCents)}</M>} hint={r.totals.unitsWithoutCost ? `${r.totals.unitsWithoutCost} un. sem custo` : "custo da Shopify"} />
            <Kpi label="Comissão" value={<M>{formatBRL(p.commissionCents)}</M>} hint={pct(p.commissionCents, p.revenueCents) + " da receita"} />
            <Kpi label="Kits enviados" value={<M>{formatBRL(p.kitsCents)}</M>} hint={`${p.shipments} envios${p.kitUnitsWithoutCost ? ` · ${p.kitUnitsWithoutCost} un. sem custo` : ""}`} />
            <Kpi label="Frete" value={<M>{formatBRL(p.freightCents)}</M>} hint={p.shipmentsWithoutFreight ? `${p.shipmentsWithoutFreight} envios sem frete informado` : "dos envios do período"} />
            <Kpi
              label="Lucro do programa"
              value={<M>{formatBRL(p.profitCents)}</M>}
              hint={`margem ${pct(p.profitCents, p.revenueCents)}`}
              tone={p.profitCents < 0 ? "red" : undefined}
            />
          </div>
          <p className={ui.hint}>Receita = valor pago pelos produtos (já com o desconto do cupom). Lucro = receita − custo dos produtos − comissão − kits − frete.</p>
        </Card>
      )}
      <Card title={`Por produto (${r.rows.length})`}>
        {r.rows.length === 0 ? (
          <p className={ui.muted}>Nenhuma venda no período.</p>
        ) : (
          <div className="-mx-2 overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="[&>th]:px-2 [&>th]:py-2 [&>th]:text-left [&>th]:text-xs [&>th]:font-medium [&>th]:uppercase [&>th]:tracking-wide [&>th]:text-stone-500">
                  <th>Produto</th>
                  <th className="!text-right">Unidades</th>
                  <th className="!text-right">Pedidos</th>
                  <th className="!text-right">Receita</th>
                  <th className="!text-right">Custo un.</th>
                  <th className="!text-right">Custo total</th>
                  <th className="!text-right">Margem</th>
                </tr>
              </thead>
              <tbody>
                {r.rows.map((x) => (
                  <tr key={x.key} className="border-t border-stone-200/70 tabular-nums [&>td]:px-2 [&>td]:py-2.5 dark:border-white/10">
                    <td className="max-w-80 truncate font-medium">{x.title}</td>
                    <td className="text-right">{x.units}</td>
                    <td className="text-right">{x.orders}</td>
                    <td className="text-right"><M>{formatBRL(x.revenueCents)}</M></td>
                    <td className="text-right">{x.unitCostCents === null ? <span className="text-stone-400">sem custo</span> : <M>{formatBRL(x.unitCostCents)}</M>}</td>
                    <td className="text-right">{x.costCents === null ? "—" : <M>{formatBRL(x.costCents)}</M>}</td>
                    <td className={`text-right ${x.marginCents !== null && x.marginCents < 0 ? "text-red-700 dark:text-red-400" : ""}`}>
                      {x.marginCents === null ? "—" : <><M>{formatBRL(x.marginCents)}</M> <span className="text-xs text-stone-500">{pct(x.marginCents, x.revenueCents)}</span></>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
