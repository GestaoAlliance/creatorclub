import { shopStats } from "@/domain";
import { releaseProgress } from "@/lib/commission/release";
import { productImages } from "@/lib/reports/product-images";
import { ShipmentList } from "@/components/portal/shipments-view";
import { ShopPicker } from "@/components/portal/shop-picker";
import { db } from "@/lib/db";
import { currentPortalContext } from "@/lib/portal/current";
import { myShop } from "@/lib/shipments/shop";
import { informedAddress, myAddress, myShipments } from "@/lib/shipments/shipments";

export const dynamic = "force-dynamic";

// Aba Loja (D-SHOPTAB; M5.1, D-SHOPBALANCE; visual D-PORTALSHOP): comprar produtos com o saldo e acompanhar as compras.
export default async function PortalShop({ params }: { params: Promise<{ marca: string }> }) {
  const { marca } = await params;
  const ctx = await currentPortalContext(marca);
  const [address, shipments, shop] = await Promise.all([myAddress(db(), ctx), myShipments(db(), ctx), myShop(db(), ctx)]);
  const informed = address ? null : await informedAddress(db(), ctx);
  const purchases = shipments.filter((s) => s.balanceCents !== null);
  // D-PORTALSHOP: quanto economizou (preço cheio de hoje − o que pagou, nas compras não canceladas), os mais comprados e
  // a meta quando não há saldo.
  const [imageOf, release] = await Promise.all([productImages(db(), ctx.brand.id), releaseProgress(db(), ctx.creatorId, new Date())]);
  const products = shop.allowed ? shop.products.map((p) => ({ ...p, photo: imageOf(p.title) ?? p.photo })) : [];
  const { savedCents, favorites } = shopStats(purchases, products);
  const goal = release.minCents !== null && release.accumulatedCents < release.minCents
    ? { missingCents: release.minCents - release.accumulatedCents, what: release.basis === "COMMISSION" ? "de comissão" : "em vendas", nextDay: release.nextClosingAt.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" }) }
    : null;
  const images = Object.fromEntries([...new Set(purchases.flatMap((s) => s.items.map((it) => it.title)))].map((t) => [t, imageOf(t)]));
  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <ShopPicker marca={ctx.brand.slug} shop={shop.allowed ? { ...shop, products } : shop} address={address} informed={informed} viewOnly={ctx.viewAs !== null} savedCents={savedCents} favorites={favorites} goal={goal} />
      <ShipmentList marca={ctx.brand.slug} shipments={purchases} viewOnly={ctx.viewAs !== null} images={images} title="Minhas compras" empty="Nenhuma compra ainda. O que você comprar com o saldo aparece aqui." />
    </div>
  );
}
