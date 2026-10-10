import { Plus } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page";
import { ui } from "@/components/ui/styles";
import { redirect } from "next/navigation";
import { brandsWith, can } from "@/lib/auth/permissions";
import { currentActor } from "@/lib/auth/current";
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
  const [shipments, form] = await Promise.all([
    staffShipments(db(), actor, status ? { status } : {}),
    canManage ? shipmentFormData(db(), actor) : null,
  ]);

  return (
    <>
      <PageHeader title="Envios">Produtos enviados às creators. Registre o envio, marque como enviado com o rastreio e acompanhe a entrega.</PageHeader>
      {form && (
        <details className="group" open={shipments.length === 0}>
          <summary className={`${ui.btn} cursor-pointer list-none self-start`}>
            <Plus className="size-4 transition-transform group-open:rotate-45" /> Novo envio
          </summary>
          <div className="mt-4">
            <NewShipmentForm creators={form.creators} products={form.products} />
          </div>
        </details>
      )}
      <nav aria-label="Situação" className="flex flex-wrap gap-2">
        <Link href="/admin/envios" className={!status ? ui.pillOn : ui.pill}>Todos</Link>
        {STATUSES.map((s) => (
          <Link key={s} href={`/admin/envios?situacao=${s}`} className={status === s ? ui.pillOn : ui.pill}>{SHIPMENT_STATUS_LABEL[s]}</Link>
        ))}
      </nav>
      <ShipmentsTable
        shipments={shipments.map((s) => ({
          ...s,
          canManage: can(actor.grants, "shipping.manage", s.brandId),
          address: can(actor.grants, "personal.address", s.brandId) ? (s.address as ShipmentAddress) : null,
        }))}
      />
    </>
  );
}
