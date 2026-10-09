import Link from "next/link";
import { redirect } from "next/navigation";
import { brandsWith, can } from "@/lib/auth/permissions";
import { currentActor } from "@/lib/auth/current";
import { db } from "@/lib/db";
import type { Address } from "@/lib/shipments/address";
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
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-10">
      <h1 className="text-2xl font-bold">Envios</h1>
      {form && <NewShipmentForm creators={form.creators} products={form.products} />}
      <nav className="flex flex-wrap gap-3 text-sm">
        <Link href="/admin/envios" className={!status ? "font-semibold" : "underline"}>Todos</Link>
        {STATUSES.map((s) => (
          <Link key={s} href={`/admin/envios?situacao=${s}`} className={status === s ? "font-semibold" : "underline"}>{SHIPMENT_STATUS_LABEL[s]}</Link>
        ))}
      </nav>
      <ShipmentsTable
        shipments={shipments.map((s) => ({
          ...s,
          canManage: can(actor.grants, "shipping.manage", s.brandId),
          address: can(actor.grants, "personal.address", s.brandId) ? (s.address as Address) : null,
        }))}
      />
    </main>
  );
}
