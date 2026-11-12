import { dayKey } from "@/domain";
import { productImages } from "@/lib/reports/product-images";
import { shipmentEtas } from "@/lib/shipments/review";
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
  // D-SHIPETA e fotos dos produtos (D-PORTALSHIP).
  const [etas, imageOf] = await Promise.all([
    shipmentEtas(db(), ctx.brand.id, shipments.filter((s) => s.status === "SHIPPED").map((s) => ({ id: s.id, shippedAt: s.shippedAt, address: s.address }))),
    productImages(db(), ctx.brand.id),
  ]);
  const images = Object.fromEntries([...new Set(shipments.flatMap((s) => s.items.map((it) => it.title)))].map((t) => [t, imageOf(t)]));
  // Foto do produto do kit: a da Shopify quando a local não existe (D-PRODUCTTHUMB).
  const kitsWithPhotos = { ...kits, products: kits.products.map((p) => ({ ...p, photo: imageOf(p.title) ?? p.photo })), kits: kits.kits.map((k) => ({ ...k, preset: k.preset ? k.preset.map((p) => ({ ...p, photo: imageOf(p.title) ?? p.photo })) : k.preset })) };
  return <ShipmentsView etas={Object.fromEntries(etas)} images={images} year={dayKey(new Date(), "America/Sao_Paulo").slice(0, 4)} marca={ctx.brand.slug} address={address} shipments={shipments} kits={kitsWithPhotos} history={history} viewOnly={ctx.viewAs !== null} informedAddress={informed} progress={progress} />;
}
