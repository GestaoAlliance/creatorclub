import { ShipmentsView } from "@/components/portal/shipments-view";
import { db } from "@/lib/db";
import { currentPortalContext } from "@/lib/portal/current";
import { myPendingKits } from "@/lib/shipments/kits";
import { informedAddress, myAddress, myShipments } from "@/lib/shipments/shipments";

export const dynamic = "force-dynamic";

// Aba Envios (E7.8): kit do mês a escolher (D-KIT), endereço de entrega (a creator mantém) e os produtos enviados a ela.
export default async function PortalShipments({ params }: { params: Promise<{ marca: string }> }) {
  const { marca } = await params;
  const ctx = await currentPortalContext(marca);
  const [address, shipments, kits] = await Promise.all([myAddress(db(), ctx), myShipments(db(), ctx), myPendingKits(db(), ctx)]);
  const informed = address ? null : await informedAddress(db(), ctx);
  return <ShipmentsView marca={ctx.brand.slug} address={address} shipments={shipments} kits={kits} viewOnly={ctx.viewAs !== null} informedAddress={informed} />;
}
