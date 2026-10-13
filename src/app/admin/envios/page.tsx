import { Plus } from "lucide-react";
import Link from "next/link";
import { HelpTip } from "@/components/ui/tour";
import { PageHeader } from "@/components/ui/page";
import { ui } from "@/components/ui/styles";
import { redirect } from "next/navigation";
import { brandsWith, can } from "@/lib/auth/permissions";
import { currentActor } from "@/lib/auth/current";
import { scopedActor, staffContext } from "@/lib/staff/context";
import { db } from "@/lib/db";
import type { ShipmentAddress } from "@/lib/shipments/address";
import { SHIPMENT_STATUS_LABEL, shipmentFormData, staffShipments, type ShipmentStatusValue } from "@/lib/shipments/shipments";
import { NewShipmentForm } from "./forms";
import { ShipmentsTable } from "./table";

export const dynamic = "force-dynamic";

const STATUSES = Object.keys(SHIPMENT_STATUS_LABEL) as ShipmentStatusValue[];

// Envios de produtos às creators (E7.8). Tela simples da equipe (D-ADMINUI): Envio, Gestão e super admin.
export default async function EnviosPage({ searchParams }: { searchParams: Promise<{ situacao?: string }> }) {
  const actor = await currentActor();
  if (!actor) redirect("/entrar?next=/admin/envios");
  const view = brandsWith(actor.grants, "shipping.view");
  if (view !== "ALL" && view.length === 0) redirect("/conta");
  const { situacao } = await searchParams;
  const status = STATUSES.find((s) => s === situacao);
  const manage = brandsWith(actor.grants, "shipping.manage");
  const canManage = manage === "ALL" || manage.length > 0;
  // A1 (D-ALLIANCE): só a marca escolhida no topo.
  const inBrand = scopedActor(actor, (await staffContext(actor)).brand?.id);
  const [shipments, form] = await Promise.all([
    staffShipments(db(), inBrand, status ? { status } : {}),
    canManage ? shipmentFormData(db(), inBrand) : null,
  ]);

  const awaitingCount = (await staffShipments(db(), inBrand, { status: "AWAITING_APPROVAL" })).length;
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
      <nav aria-label="Situação" data-tour="en-situacao" className="flex flex-wrap items-center gap-2">
        <Link href="/admin/envios" className={!status ? ui.pillOn : ui.pill}>Todos</Link>
        {STATUSES.map((s) => (
          <Link key={s} href={`/admin/envios?situacao=${s}`} className={status === s ? ui.pillOn : ui.pill}>{SHIPMENT_STATUS_LABEL[s]}</Link>
        ))}
        <HelpTip id="en-situacao" />
      </nav>
      <ShipmentsTable
        shipments={shipments.map((s) => ({
          ...s,
          canManage: can(actor.grants, "shipping.manage", s.brandId),
          canApprove: can(actor.grants, "creators.edit", s.brandId),
          address: can(actor.grants, "personal.address", s.brandId) ? (s.address as ShipmentAddress) : null,
        }))}
      />
    </>
  );
}
