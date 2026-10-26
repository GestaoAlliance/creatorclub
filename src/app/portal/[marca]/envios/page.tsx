import { ShipmentsView } from "@/components/portal/shipments-view";
import { db } from "@/lib/db";
import { currentPortalContext } from "@/lib/portal/current";
import { myPendingKits, productRequestState } from "@/lib/shipments/kits";
import { informedAddress, myAddress, myShipments } from "@/lib/shipments/shipments";

export const dynamic = "force-dynamic";

// Aba Envios (E7.8): kit do mês a escolher (D-KIT), endereço de entrega (a creator mantém) e os produtos enviados a ela.
export default async function PortalShipments({ params }: { params: Promise<{ marca: string }> }) {
  const { marca } = await params;
  const ctx = await currentPortalContext(marca);
  const [address, shipments, kits] = await Promise.all([myAddress(db(), ctx), myShipments(db(), ctx), myPendingKits(db(), ctx)]);
  const informed = address ? null : await informedAddress(db(), ctx);
  // D-PRODUCTREQ: pedir produtos quando quiser (ativa, contrato assinado, sem outro pedido esperando).
  const state = await productRequestState(db(), ctx);
  const request = state.allowed
    ? { allowed: true as const, products: await db().product.findMany({ where: { brandId: ctx.brand.id, active: true }, orderBy: { title: "asc" }, select: { id: true, title: true } }) }
    : state;
  return <ShipmentsView marca={ctx.brand.slug} address={address} shipments={shipments} kits={kits} viewOnly={ctx.viewAs !== null} informedAddress={informed} request={request} />;
}
