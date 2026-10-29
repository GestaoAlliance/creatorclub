import { ShipmentsView } from "@/components/portal/shipments-view";
import { db } from "@/lib/db";
import { currentPortalContext } from "@/lib/portal/current";
import { kitProgress, myKitHistory, myPendingKits } from "@/lib/shipments/kits";
import { informedAddress, myAddress, myShipments } from "@/lib/shipments/shipments";

export const dynamic = "force-dynamic";

// Aba Pedidos (E7.8, antes "Envios"; D-SHOPTAB): os produtos que ela ganha (liberados, próximo, histórico), endereço e
// os envios. A loja com o saldo tem aba própria (/loja).
export default async function PortalShipments({ params }: { params: Promise<{ marca: string }> }) {
  const { marca } = await params;
  const ctx = await currentPortalContext(marca);
  const [address, shipments, kits, history, progress] = await Promise.all([myAddress(db(), ctx), myShipments(db(), ctx), myPendingKits(db(), ctx), myKitHistory(db(), ctx), kitProgress(db(), ctx)]);
  const informed = address ? null : await informedAddress(db(), ctx);
  return <ShipmentsView marca={ctx.brand.slug} address={address} shipments={shipments} kits={kits} history={history} viewOnly={ctx.viewAs !== null} informedAddress={informed} progress={progress} />;
}
