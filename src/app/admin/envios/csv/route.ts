import type { NextRequest } from "next/server";
import { dayKey, shipmentsCsv } from "@/domain";
import { currentActor } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { shipmentsForCsv } from "@/lib/shipments/csv";
import { SHIPMENT_STATUS_LABEL, ShipmentError, type ShipmentStatusValue } from "@/lib/shipments/shipments";
import { staffContext } from "@/lib/staff/context";

export const dynamic = "force-dynamic";

// Planilha dos envios (D-SHIPCSV): situação da tela e período (data do pedido), da marca escolhida no topo.
export async function GET(request: NextRequest) {
  const actor = await currentActor();
  if (!actor) return new Response("Entre para baixar.", { status: 401 });
  const { brand } = await staffContext(actor);
  if (!brand) return new Response("Escolha a marca no topo.", { status: 400 });
  const sp = request.nextUrl.searchParams;
  const situacao = sp.get("situacao") ?? "";
  const status = situacao in SHIPMENT_STATUS_LABEL ? (situacao as ShipmentStatusValue) : undefined;
  try {
    const rows = await shipmentsForCsv(db(), actor, brand.id, { status, from: sp.get("de") ?? undefined, to: sp.get("ate") ?? undefined });
    return new Response(shipmentsCsv(rows), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="envios-${brand.slug}-${dayKey(new Date())}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof ShipmentError) return new Response(error.message, { status: 403 });
    throw error;
  }
}
