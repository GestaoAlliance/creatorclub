import Link from "next/link";
import { HelpTip } from "@/components/ui/tour";
import { redirect } from "next/navigation";
import { formatBRL } from "@/domain";
import { brandsWith } from "@/lib/auth/permissions";
import { currentActor } from "@/lib/auth/current";
import { scopedActor, staffContext } from "@/lib/staff/context";
import { db } from "@/lib/db";
import { WITHDRAWAL_STATUS_LABEL } from "@/lib/portal/withdrawals";
import { withdrawalQueue, type QueueFilter } from "@/lib/withdrawals/decide";
import { payoutSummary } from "@/lib/withdrawals/summary";
import { Card, Kpi, PageHeader } from "@/components/ui/page";
import { ui } from "@/components/ui/styles";
import { BatchBar } from "./forms";
import { SaquesTable } from "./table";

export const dynamic = "force-dynamic";

const TABS: { id: QueueFilter; ver: string | null; label: string }[] = [
  { id: "REQUESTED", ver: "analise", label: WITHDRAWAL_STATUS_LABEL.REQUESTED },
  { id: "APPROVED", ver: "aprovados", label: "Aprovados" },
  { id: "DECIDED", ver: "decididos", label: "Decididos" },
];

// Saques em duas etapas (M1.1, D-WDAPPROVE): a Gestão aprova, o Pagamento faz o Pix. Tela da equipe (D-ADMINUI).
export default async function SaquesPage({ searchParams }: { searchParams: Promise<{ ver?: string }> }) {
  const actor = await currentActor();
  if (!actor) redirect("/entrar?next=/admin/saques");
  const allowed = brandsWith(actor.grants, "withdrawals.view");
  if (allowed !== "ALL" && allowed.length === 0) redirect("/conta");
  const { ver } = await searchParams;
  // A1 (D-ALLIANCE): só a marca escolhida no topo.
  const brandId = (await staffContext(actor)).brand?.id;
  const inBrand = scopedActor(actor, brandId);
  // Sem escolher aba: quem só paga (Pagamento) abre nos aprovados; quem aprova, em análise.
  const approves = brandsWith(inBrand.grants, "withdrawals.approve");
  const defaultTab: QueueFilter = approves !== "ALL" && approves.length === 0 ? "APPROVED" : "REQUESTED";
  const tab = TABS.find((t) => t.ver === ver)?.id ?? defaultTab;
  const [rows, sum] = await Promise.all([withdrawalQueue(db(), inBrand, tab), payoutSummary(db(), inBrand, brandId ? [brandId] : undefined)]);

  return (
    <>
      <PageHeader title="Saques">
        Em duas etapas: a Gestão confere a nota (valor e CNPJ do tomador) e aprova; o Pagamento faz o Pix e marca como pago. Se algo não bate,
        recuse com o motivo: a creator vê e pode pedir de novo.
      </PageHeader>
      <Card title="Comissão a pagar" help="sq-resumo">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
          <Kpi label="Sacável" value={formatBRL(sum.availableCents)} hint="liberado e ainda não pedido" />
          <Kpi label="Em análise" value={formatBRL(sum.requested.cents)} hint={`${sum.requested.count} ${sum.requested.count === 1 ? "pedido" : "pedidos"} · a Gestão aprova`} tone={sum.requested.count ? "amber" : undefined} />
          <Kpi label="Aprovados" value={formatBRL(sum.approved.cents)} hint={`${sum.approved.count} ${sum.approved.count === 1 ? "pedido" : "pedidos"} · o Pagamento faz o Pix`} tone={sum.approved.count ? "amber" : undefined} />
          <Kpi label="A liberar" value={formatBRL(sum.heldCents)} hint="espera o fechamento do mês e o mínimo" />
          <Kpi label="Aguardando" value={formatBRL(sum.awaiting.salesCents)} hint={`em vendas sem pagamento ainda (${sum.awaiting.orders})`} />
        </div>
      </Card>
      <nav aria-label="Situação" data-tour="sq-abas" className="flex flex-wrap items-center gap-2">
        {TABS.map((t) => (
          <Link key={t.id} href={`/admin/saques?ver=${t.ver}`} className={tab === t.id ? ui.pillOn : ui.pill}>
            {t.label}
            {t.id === "REQUESTED" && sum.requested.count > 0 && ` (${sum.requested.count})`}
            {t.id === "APPROVED" && sum.approved.count > 0 && ` (${sum.approved.count})`}
          </Link>
        ))}
        <HelpTip id="sq-abas" />
        <Link href="/admin/saques/conferencia" className={`${ui.link} ml-auto text-sm`}>Conferir a planilha de pagamentos →</Link>
      </nav>
      {tab === "APPROVED" && rows.some((r) => r.canPay) && <BatchBar count={rows.filter((r) => r.canPay).length} />}
      <SaquesTable rows={rows} />
    </>
  );
}
