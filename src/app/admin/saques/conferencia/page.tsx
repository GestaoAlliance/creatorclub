import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, PageHeader } from "@/components/ui/page";
import { badge, ui } from "@/components/ui/styles";
import { formatBRL } from "@/domain";
import { can } from "@/lib/auth/permissions";
import { currentActor } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { paymentsCheck } from "@/lib/sheets/pagamentos";
import { staffContext } from "@/lib/staff/context";

export const dynamic = "force-dynamic";

const brl = (c: number | null) => (c === null ? "—" : formatBRL(c));
const pct = (bps: number | null) => (bps === null ? "—" : `${(bps / 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`);
const day = (k: string) => `${k.slice(8, 10)}/${k.slice(5, 7)}/${k.slice(0, 4)}`;
const fmt = (d: Date | null) => (d ? d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }) : "—");

// Conferência da planilha "Pagamentos influencers" (S3, D-SHEETREADONLY): só compara, nada de dinheiro muda.
export default async function PaymentsCheckPage({ searchParams }: { searchParams: Promise<{ todas?: string }> }) {
  const actor = await currentActor();
  if (!actor) redirect("/entrar?next=/admin/saques/conferencia");
  const { brand } = await staffContext(actor);
  if (!brand) return <p className={ui.muted}>Nenhuma marca.</p>;
  if (!can(actor.grants, "money.view", brand.id)) redirect("/conta");
  const all = (await searchParams).todas === "1";
  const { lastReadAt, rows } = await paymentsCheck(db(), brand.id);
  const diff = rows.filter((r) => r.issues.length);
  const shown = all ? rows : diff;
  const tabs = [...new Map(shown.map((r) => [r.tab, r])).values()];

  return (
    <>
      <PageHeader title="Conferência da planilha de pagamentos">
        Compara a planilha &quot;Pagamentos influencers&quot; com o que o sistema calculou (vendas pela data do pagamento e comissão do
        extrato). Só mostra; nada muda no saldo. Última leitura: {fmt(lastReadAt)}.
      </PageHeader>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span>
          <strong>{diff.length}</strong> de {rows.length} linhas com diferença.
        </span>
        <Link href={all ? "/admin/saques/conferencia" : "/admin/saques/conferencia?todas=1"} className={ui.link}>
          {all ? "Mostrar só as diferenças" : "Mostrar todas as linhas"}
        </Link>
      </div>
      {rows.length === 0 && <p className={ui.muted}>A planilha ainda não foi lida. Ela entra pelo script de leitura (docs/sheets/leitura.gs).</p>}
      {rows.length > 0 && shown.length === 0 && <p className={ui.muted}>Tudo confere com o sistema.</p>}
      {tabs.map((t) => (
        <Card key={t.tab} title={`${t.tab} · ${day(t.from)} a ${day(t.to)}`}>
          <ul className={ui.list}>
            {shown
              .filter((r) => r.tab === t.tab)
              .map((r) => (
                <li key={`${r.tab}-${r.row}`} className={ui.row}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm font-semibold">{r.coupon}</span>
                    {r.creatorId ? (
                      <Link href={`/admin/creators/${r.creatorId}`} className="text-sm hover:underline">{r.creatorName}</Link>
                    ) : (
                      <span className="text-sm">{r.name}</span>
                    )}
                    {r.issues.length === 0 ? (
                      <span className={badge.green}>confere</span>
                    ) : (
                      r.issues.map((i) => <span key={i} className={badge.amber}>{i}</span>)
                    )}
                  </div>
                  <div className="grid gap-1 text-sm sm:grid-cols-2">
                    <p>
                      <span className={ui.hint}>Planilha: </span>
                      vendas {brl(r.salesCents)} · {pct(r.rateBps)} · a pagar {brl(r.payCents)}
                    </p>
                    <p>
                      <span className={ui.hint}>Sistema: </span>
                      {r.system
                        ? `vendas ${brl(r.system.salesCents)} (${r.system.orders} ${r.system.orders === 1 ? "pedido" : "pedidos"}) · ${r.system.rates.length ? r.system.rates.map((x) => pct(x)).join(", ") : "—"} · comissão ${brl(r.system.commissionCents)}`
                        : "cupom não encontrado"}
                    </p>
                  </div>
                </li>
              ))}
          </ul>
        </Card>
      ))}
    </>
  );
}
