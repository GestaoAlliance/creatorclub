import { SalesView } from "@/components/portal/sales-view";
import { db } from "@/lib/db";
import { PortalError } from "@/lib/portal/context";
import { currentPortalContext } from "@/lib/portal/current";
import { portalSales } from "@/lib/portal/sales";

export const dynamic = "force-dynamic";

// Vendas do portal (E7.3). Acesso conferido de novo aqui; mês inválido no endereço cai no mais recente.
export default async function PortalSales({ params, searchParams }: { params: Promise<{ marca: string }>; searchParams: Promise<{ mes?: string }> }) {
  const { marca } = await params;
  const { mes } = await searchParams;
  const ctx = await currentPortalContext(marca);
  let page;
  try {
    page = await portalSales(db(), ctx, mes ? { month: mes } : {});
  } catch (error) {
    if (!(error instanceof PortalError)) throw error;
    page = await portalSales(db(), ctx);
  }
  return <SalesView page={page} base={`/portal/${ctx.brand.slug}`} />;
}
