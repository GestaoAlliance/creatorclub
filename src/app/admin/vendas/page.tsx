import { Download } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, Kpi, PageHeader } from "@/components/ui/page";
import { badge, ui } from "@/components/ui/styles";
import { formatBRL, SALE_STATUS_LABEL, SALE_STATUSES, type SaleStatus } from "@/domain";
import { can } from "@/lib/auth/permissions";
import { currentActor } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { listSales, SALES_PAGE_SIZE } from "@/lib/sales/list";
import { filtersOf, type Search } from "./filters";
import { staffContext } from "@/lib/staff/context";

export const dynamic = "force-dynamic";

const STATUS_BADGE: Record<SaleStatus, string> = { PAID: badge.green, PENDING: badge.amber, REFUNDED: badge.red, CANCELLED: badge.neutral, TEST: badge.sky };

const query = (sp: Search, change: Partial<Search>) => {
  const next = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...sp, ...change })) if (v) next.set(k, v);
  const s = next.toString();
  return s ? `?${s}` : "";
};

// Vendas da marca (M0.1, docs/PLANO-MELHORIAS.md): todas as vendas da loja, com a creator que levou ou o motivo.
export default async function SalesPage({ searchParams }: { searchParams: Promise<Search> }) {
  const actor = await currentActor();
  if (!actor) redirect("/entrar?next=/admin/vendas");
  const { brand } = await staffContext(actor);
  if (!brand) return <p className={ui.muted}>Nenhuma marca.</p>;
  if (!can(actor.grants, "money.view", brand.id)) redirect("/conta");
  const sp = await searchParams;
  const f = filtersOf(sp);
  const page = Math.max(1, Number.parseInt(sp.pagina ?? "1", 10) || 1);
  const r = await listSales(db(), brand.id, f, page);
  const pages = Math.max(1, Math.ceil(r.total / SALES_PAGE_SIZE));
  const when = (d: Date) => d.toLocaleString("pt-BR", { timeZone: r.timezone, dateStyle: "short", timeStyle: "short" });
  const allCount = SALE_STATUSES.reduce((s, k) => s + r.counts[k], 0);

  return (
    <>
      <PageHeader
        title="Vendas"
        actions={
          <a href={`/admin/vendas/csv${query(sp, { pagina: "" })}`} className={ui.ghost}>
            <Download className="size-4" /> Exportar CSV
          </a>
        }
      >
        Todas as vendas da loja que chegaram da Shopify, com a creator que levou cada uma (ou o motivo de não ter levado) e a comissão
        já lançada. Comissão só nasce de venda paga.
      </PageHeader>

      <form className={`${ui.card} grid gap-3 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr_auto]`}>
        {f.status && <input type="hidden" name="situacao" value={f.status} />}
        <label className={ui.label}>
          Buscar
          <input name="q" defaultValue={f.q} placeholder="Pedido, cupom ou creator" className={ui.inputSm} />
        </label>
        <label className={ui.label}>
          Creator
          <select name="dona" defaultValue={sp.dona ?? ""} className={ui.inputSm}>
            <option value="">Com e sem creator</option>
            <option value="creator">Só com creator</option>
            <option value="sem">Só sem creator</option>
          </select>
        </label>
        <label className={ui.label}>
          De
          <input type="date" name="de" defaultValue={f.from} className={ui.inputSm} />
        </label>
        <label className={ui.label}>
          Até
          <input type="date" name="ate" defaultValue={f.to} className={ui.inputSm} />
        </label>
        <button className={`${ui.btnSm} self-end`}>Filtrar</button>
      </form>

      <nav className="flex flex-wrap gap-2" aria-label="Situação">
        <Link href={`/admin/vendas${query(sp, { situacao: "", pagina: "" })}`} className={f.status ? ui.pill : ui.pillOn}>
          Todas · {allCount}
        </Link>
        {SALE_STATUSES.map((s) => (
          <Link key={s} href={`/admin/vendas${query(sp, { situacao: s, pagina: "" })}`} className={f.status === s ? ui.pillOn : ui.pill}>
            {SALE_STATUS_LABEL[s]} · {r.counts[s]}
          </Link>
        ))}
      </nav>

      <Card>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Kpi label="Vendas no filtro" value={r.total} />
          <Kpi label="Valor dos produtos" value={formatBRL(r.subtotalCents)} hint="sem frete, como a base da comissão" />
          <Kpi label="Página" value={`${Math.min(page, pages)} de ${pages}`} />
        </div>
      </Card>

      {r.rows.length === 0 ? (
        <p className={ui.muted}>Nenhuma venda com esses filtros.</p>
      ) : (
        <Card>
          <ul className={ui.list}>
            {r.rows.map((o) => (
              <li key={o.id} className="grid gap-2 py-3 first:pt-0 last:pb-0 sm:grid-cols-[9rem_1fr_13rem] sm:items-center">
                <div>
                  <p className="font-mono text-sm font-semibold">{o.name}</p>
                  <p className={ui.hint}>{when(o.createdAt)}</p>
                </div>
                <div className="flex min-w-0 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className={STATUS_BADGE[o.status]}>{SALE_STATUS_LABEL[o.status]}</span>
                    {o.codes.map((c) => (
                      <span key={c} className="rounded-md bg-stone-500/10 px-1.5 py-0.5 font-mono text-xs">{c}</span>
                    ))}
                  </div>
                  {o.creatorId ? (
                    <p className="text-sm">
                      <Link href={`/admin/creators/${o.creatorId}`} className={ui.link}>{o.creatorName}</Link>
                      <span className={ui.hint}> · {o.reason}</span>
                    </p>
                  ) : (
                    <p className="text-sm text-stone-500">{o.reason}</p>
                  )}
                </div>
                <div className="sm:text-right">
                  <p className="font-semibold tabular-nums">{formatBRL(o.subtotalCents)}</p>
                  <p className={ui.hint}>
                    total {formatBRL(o.totalCents)}
                    {o.commissionCents !== null && (o.status === "PENDING" && o.commissionCents === 0 ? " · comissão quando pagar" : ` · comissão ${formatBRL(o.commissionCents)}`)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {pages > 1 && (
        <div className="flex items-center justify-between gap-3 text-sm">
          {page > 1 ? <Link href={`/admin/vendas${query(sp, { pagina: String(page - 1) })}`} className={ui.ghostSm}>← Anteriores</Link> : <span />}
          {page < pages && <Link href={`/admin/vendas${query(sp, { pagina: String(page + 1) })}`} className={ui.ghostSm}>Próximas →</Link>}
        </div>
      )}
    </>
  );
}
