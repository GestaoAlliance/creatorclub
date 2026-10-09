import { SalesView } from "@/components/portal/sales-view";
import { db } from "@/lib/db";
import { currentPortalContext } from "@/lib/portal/current";
import { portalSales } from "@/lib/portal/sales";

export const dynamic = "force-dynamic";

// Vendas do portal (E7.3). Acesso conferido de novo aqui; período inválido no endereço cai em "Este mês".
export default async function PortalSales({
  params,
  searchParams,
}: {
  params: Promise<{ marca: string }>;
  searchParams: Promise<{ p?: string; de?: string; ate?: string }>;
}) {
  const { marca } = await params;
  const q = await searchParams;
  const ctx = await currentPortalContext(marca);
  const page = await portalSales(db(), ctx, {
    ...(typeof q.p === "string" ? { p: q.p } : {}),
    ...(typeof q.de === "string" ? { de: q.de } : {}),
    ...(typeof q.ate === "string" ? { ate: q.ate } : {}),
  });
  return <SalesView page={page} base={`/portal/${ctx.brand.slug}`} />;
}
