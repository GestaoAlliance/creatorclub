import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { WithdrawalForm } from "@/components/portal/withdrawal-form";
import { db } from "@/lib/db";
import { currentPortalContext } from "@/lib/portal/current";
import { portalWithdrawalTab } from "@/lib/portal/withdrawals";

export const dynamic = "force-dynamic";

const mask = (pix: string) => (pix.length <= 6 ? "•••" : `${pix.slice(0, 3)}•••${pix.slice(-3)}`);

// Passo a passo do saque (D-WDFLOW). Se alguma regra impede o pedido, volta para a aba Saque (que explica o motivo).
export default async function NewWithdrawal({ params }: { params: Promise<{ marca: string }> }) {
  const { marca } = await params;
  const ctx = await currentPortalContext(marca);
  const tab = await portalWithdrawalTab(db(), ctx);
  if (tab.blocks.length) redirect(`/portal/${ctx.brand.slug}/saque`);
  const [brand, account] = await Promise.all([
    db().brand.findUniqueOrThrow({ where: { id: ctx.brand.id }, select: { nfTakerDocument: true, nfInstructions: true } }),
    db().creator.findUniqueOrThrow({ where: { id: ctx.creatorId }, select: { account: { select: { pixKey: true } } } }),
  ]);
  return (
    <WithdrawalForm
      marca={ctx.brand.slug}
      requestId={randomUUID()}
      availableCents={tab.balance.availableCents}
      minCents={tab.policy.minCents}
      takerDocument={brand.nfTakerDocument}
      nfInstructions={brand.nfInstructions}
      pixKeyMasked={account.account.pixKey ? mask(account.account.pixKey) : null}
    />
  );
}
