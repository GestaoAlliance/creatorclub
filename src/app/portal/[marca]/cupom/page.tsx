import { headers } from "next/headers";
import { CouponView } from "@/components/portal/coupon-view";
import { db } from "@/lib/db";
import { portalCoupons } from "@/lib/portal/coupons";
import { currentPortalContext } from "@/lib/portal/current";

export const dynamic = "force-dynamic";

// Aba Cupom (E7.5). O link usa o endereço por onde o portal foi aberto (funciona no domínio novo sem mudar nada).
export default async function PortalCoupon({ params }: { params: Promise<{ marca: string }> }) {
  const { marca } = await params;
  const ctx = await currentPortalContext(marca);
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const coupons = await portalCoupons(db(), ctx);
  return <CouponView coupons={coupons} origin={`${proto}://${host}`} brandName={ctx.brand.name} deactivated={ctx.status === "DEACTIVATED"} />;
}
