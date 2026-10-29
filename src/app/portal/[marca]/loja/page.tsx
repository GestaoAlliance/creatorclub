import { ShipmentList } from "@/components/portal/shipments-view";
import { ShopPicker } from "@/components/portal/shop-picker";
import { db } from "@/lib/db";
import { currentPortalContext } from "@/lib/portal/current";
import { myShop } from "@/lib/shipments/shop";
import { informedAddress, myAddress, myShipments } from "@/lib/shipments/shipments";

export const dynamic = "force-dynamic";

// Aba Loja (D-SHOPTAB; M5.1, D-SHOPBALANCE): comprar produtos com o saldo e acompanhar as compras.
export default async function PortalShop({ params }: { params: Promise<{ marca: string }> }) {
  const { marca } = await params;
  const ctx = await currentPortalContext(marca);
  const [address, shipments, shop] = await Promise.all([myAddress(db(), ctx), myShipments(db(), ctx), myShop(db(), ctx)]);
  const informed = address ? null : await informedAddress(db(), ctx);
  const purchases = shipments.filter((s) => s.balanceCents !== null);
  return (
    <div className="flex flex-col gap-6">
      {shop.allowed && shop.availableCents <= 0 && (
        <p className="rounded-2xl border border-amber-400/60 bg-amber-100/70 px-4 py-3 text-sm text-amber-950 dark:bg-amber-900/30 dark:text-amber-100">
          Seu saldo ainda é R$ 0,00: venda com o seu cupom para usar a loja. Os produtos e preços ficam aqui para você conhecer.
        </p>
      )}
      <ShopPicker marca={ctx.brand.slug} shop={shop} address={address} informed={informed} viewOnly={ctx.viewAs !== null} />
      <ShipmentList marca={ctx.brand.slug} shipments={purchases} viewOnly={ctx.viewAs !== null} title="Minhas compras" empty="Nenhuma compra ainda. O que você comprar com o saldo aparece aqui." />
    </div>
  );
}
