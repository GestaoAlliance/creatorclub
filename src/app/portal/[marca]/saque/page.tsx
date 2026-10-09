import { WithdrawalView } from "@/components/portal/withdrawal-view";
import { db } from "@/lib/db";
import { PortalError } from "@/lib/portal/context";
import { currentPortalContext } from "@/lib/portal/current";
import { portalWithdrawalTab } from "@/lib/portal/withdrawals";

export const dynamic = "force-dynamic";

// Aba Saque (D-WDTAB). Acesso conferido de novo aqui; mês inválido no endereço cai no mais recente.
export default async function PortalWithdrawals({ params, searchParams }: { params: Promise<{ marca: string }>; searchParams: Promise<{ mes?: string; pedido?: string }> }) {
  const { marca } = await params;
  const { mes, pedido } = await searchParams;
  const ctx = await currentPortalContext(marca);
  let tab;
  try {
    tab = await portalWithdrawalTab(db(), ctx, typeof mes === "string" ? { month: mes } : {});
  } catch (error) {
    if (!(error instanceof PortalError)) throw error;
    tab = await portalWithdrawalTab(db(), ctx);
  }
  return <WithdrawalView tab={tab} base={`/portal/${ctx.brand.slug}`} justRequested={pedido === "enviado"} />;
}
