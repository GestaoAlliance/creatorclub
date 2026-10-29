import { Download, Plus, Printer } from "lucide-react";
import Link from "next/link";
import { HelpTip } from "@/components/ui/tour";
import { PageHeader } from "@/components/ui/page";
import { ui } from "@/components/ui/styles";
import { redirect } from "next/navigation";
import { formatDoc } from "@/domain";
import { brandsWith, can } from "@/lib/auth/permissions";
import { currentActor } from "@/lib/auth/current";
import { scopedActor, staffContext } from "@/lib/staff/context";
import { db } from "@/lib/db";
import type { ShipmentAddress } from "@/lib/shipments/address";
import { SHIPMENT_STATUS_LABEL, shipmentFormData, staffShipments, type ShipmentStatusValue } from "@/lib/shipments/shipments";
import { NewShipmentForm } from "./forms";
import { RECEIPT_CHECK_DAYS } from "@/lib/shipments/reminders";
import { ShipmentsTable } from "./table";

export const dynamic = "force-dynamic";

const STATUSES = Object.keys(SHIPMENT_STATUS_LABEL) as ShipmentStatusValue[];

// Envios de produtos às creators (E7.8). Tela simples da equipe (D-ADMINUI): Envio, Gestão e super admin.
export default async function EnviosPage({ searchParams }: { searchParams: Promise<{ situacao?: string; parado?: string }> }) {
  const actor = await currentActor();
  if (!actor) redirect("/entrar?next=/admin/envios");
  const view = brandsWith(actor.grants, "shipping.view");
  if (view !== "ALL" && view.length === 0) redirect("/conta");
  const { situacao, parado } = await searchParams;
  // D-TRACKING: "Sem Recebi há 10+ dias" (enviados, possível extravio).
  const stale = parado === "1";
  const staleBefore = new Date(Date.now() - RECEIPT_CHECK_DAYS * 86_400_000);
  const status = stale ? undefined : STATUSES.find((s) => s === situacao);
  const manage = brandsWith(actor.grants, "shipping.manage");
  const canManage = manage === "ALL" || manage.length > 0;
  // A1 (D-ALLIANCE): só a marca escolhida no topo.
  const inBrand = scopedActor(actor, (await staffContext(actor)).brand?.id);
  const [shipments, form] = await Promise.all([
    staffShipments(db(), inBrand, stale ? { staleBefore } : status ? { status } : {}),
    canManage ? shipmentFormData(db(), inBrand) : null,
  ]);

  const awaitingCount = (await staffShipments(db(), inBrand, { status: "AWAITING_APPROVAL" })).length;
  const brandId = (await staffContext(actor)).brand?.id;
  const preparingCount = brandId ? await db().shipment.count({ where: { brandId, status: "PREPARING" } }) : 0;
  const staleCount = brandId ? await db().shipment.count({ where: { brandId, status: "SHIPPED", shippedAt: { lte: staleBefore } } }) : 0;
  const canPrint = Boolean(brandId && can(actor.grants, "shipping.view", brandId) && can(actor.grants, "personal.address", brandId));
  return (
    <>
      <PageHeader title="Envios">
        Produtos enviados às creators. Pedidos das creators chegam como &quot;Aguardando aprovação&quot;: a Gestão aprova e eles vão para
        &quot;Preparando&quot;. Registre o envio, marque como enviado com o rastreio e acompanhe a entrega.
      </PageHeader>
      {awaitingCount > 0 && status !== "AWAITING_APPROVAL" && (
        <Link href="/admin/envios?situacao=AWAITING_APPROVAL" data-tour="en-aviso" className="rounded-2xl border border-amber-400/60 bg-amber-100/80 px-4 py-3 text-sm font-medium text-amber-950 dark:bg-amber-900/40 dark:text-amber-100">
          {awaitingCount} {awaitingCount === 1 ? "pedido de creator esperando" : "pedidos de creators esperando"} aprovação →
        </Link>
      )}
      {form && (
        <details className="group" open={shipments.length === 0}>
          <summary className="flex list-none items-center gap-1">
            <span data-tour="en-novo" className={`${ui.btn} cursor-pointer`}>
              <Plus className="size-4 transition-transform group-open:rotate-45" /> Novo envio
            </span>
            <HelpTip id="en-novo" />
          </summary>
          <div className="mt-4">
            <NewShipmentForm creators={form.creators} products={form.products} />
          </div>
        </details>
      )}
      {/* D-LABEL: etiquetas (4 por A4) e declarações de todos os envios em "Preparando". */}
      {preparingCount > 0 && canPrint && (
        <a href="/imprimir/envios?todos=1" target="_blank" rel="noopener noreferrer" className={`${ui.btn} inline-flex items-center gap-2 self-start`}>
          <Printer className="size-4" /> Imprimir etiquetas e declarações ({preparingCount} em Preparando)
        </a>
      )}
      <nav aria-label="Situação" data-tour="en-situacao" className="flex flex-wrap items-center gap-2">
        <Link href="/admin/envios" className={!status && !stale ? ui.pillOn : ui.pill}>Todos</Link>
        {STATUSES.map((s) => (
          <Link key={s} href={`/admin/envios?situacao=${s}`} className={status === s ? ui.pillOn : ui.pill}>{SHIPMENT_STATUS_LABEL[s]}</Link>
        ))}
        {(staleCount > 0 || stale) && (
          <Link href="/admin/envios?parado=1" className={stale ? ui.pillOn : `${ui.pill} !border-amber-400 !text-amber-800 dark:!text-amber-300`}>
            Sem &quot;Recebi&quot; há {RECEIPT_CHECK_DAYS}+ dias ({staleCount})
          </Link>
        )}
        <HelpTip id="en-situacao" />
      </nav>
      {/* D-SHIPCSV: planilha dos envios com a situação escolhida acima e, se quiser, o período (data do pedido). */}
      {canPrint && (
        <form action="/admin/envios/csv" method="get" className="flex flex-wrap items-end gap-2">
          {status && <input type="hidden" name="situacao" value={status} />}
          <label className={ui.label}>
            Pedidos de
            <input type="date" name="de" className={ui.inputSm} />
          </label>
          <label className={ui.label}>
            até
            <input type="date" name="ate" className={ui.inputSm} />
          </label>
          <button className={`${ui.ghostSm} inline-flex items-center gap-1.5`}>
            <Download className="size-4" /> Baixar planilha ({status ? SHIPMENT_STATUS_LABEL[status] : "todos"})
          </button>
        </form>
      )}
      <ShipmentsTable
        shipments={shipments.map((s) => {
          const { cpf, cnpj, phone, email, ...account } = s.creator.account;
          // D-SHIPRECIPIENT: quem vê o endereço (Envio, Gestão) vê também os dados do destinatário; nada disso vai para os outros.
          const personal = can(actor.grants, "personal.address", s.brandId);
          return {
            ...s,
            creator: { id: s.creator.id, account },
            canManage: can(actor.grants, "shipping.manage", s.brandId),
            canApprove: can(actor.grants, "creators.edit", s.brandId),
            address: personal ? (s.address as ShipmentAddress) : null,
            recipient: personal ? { cpf: cpf ? formatDoc(cpf) : null, cnpj: cnpj ? formatDoc(cnpj) : null, phone, email } : null,
          };
        })}
      />
    </>
  );
}
