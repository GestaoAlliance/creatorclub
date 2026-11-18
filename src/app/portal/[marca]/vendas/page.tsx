import Link from "next/link";
import { Megaphone } from "lucide-react";
import { dayKey } from "@/domain";
import { portalSalesExtras } from "@/lib/portal/sales-extras";
import { SalesView } from "@/components/portal/sales-view";
import { db } from "@/lib/db";
import { currentPortalContext } from "@/lib/portal/current";
import { portalSales } from "@/lib/portal/sales";

export const dynamic = "force-dynamic";

// Vendas do portal (E7.3; visual D-PORTALSALES). Acesso conferido de novo aqui; período inválido no endereço cai em "Este mês".
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
  const input = {
    ...(typeof q.p === "string" ? { p: q.p } : {}),
    ...(typeof q.de === "string" ? { de: q.de } : {}),
    ...(typeof q.ate === "string" ? { ate: q.ate } : {}),
  };
  const [page, extras] = await Promise.all([portalSales(db(), ctx, input), portalSalesExtras(db(), ctx, input)]);
  const base = `/portal/${ctx.brand.slug}`;
  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <SalesView page={page} extras={extras} today={dayKey(new Date(), "America/Sao_Paulo")} base={base} noCommission={ctx.ugcOnly} />
      {/* M4.6 (D-POSTS; D-PORTALSIMPLE: saiu do Início): registrar o post e ver quanto vendeu depois. */}
      <Link href={`${base}/posts`} className="glass flex items-center gap-3 rounded-3xl p-4 hover:shadow-sm md:p-5">
        <span className="grid size-9 shrink-0 place-content-center rounded-2xl bg-brand/10 text-brand dark:bg-brand-2/15 dark:text-brand-2"><Megaphone className="size-4" /></span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">Postou? Registre o link</span>
          <span className="text-sm text-stone-600 dark:text-stone-300">Veja quanto vendeu depois de cada post →</span>
        </span>
      </Link>
    </div>
  );
}
