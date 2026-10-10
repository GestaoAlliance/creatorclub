import { randomUUID } from "node:crypto";
import { notFound, redirect } from "next/navigation";
import { ReceiptForm } from "@/components/portal/receipt-form";
import { WithdrawalForm } from "@/components/portal/withdrawal-form";
import { dayKey } from "@/domain";
import { db } from "@/lib/db";
import { currentPortalContext } from "@/lib/portal/current";
import { portalWithdrawalTab } from "@/lib/portal/withdrawals";

export const dynamic = "force-dynamic";

const mask = (pix: string) => (pix.length <= 6 ? "•••" : `${pix.slice(0, 3)}•••${pix.slice(-3)}`);

// Passo a passo do saque (D-WDFLOW, D-CONTRACT: nota já emitida do valor total → confirmar). Se alguma regra impede o pedido, volta para a aba Saque (que explica o motivo).
export default async function NewWithdrawal({ params }: { params: Promise<{ marca: string }> }) {
  const { marca } = await params;
  const ctx = await currentPortalContext(marca);
  if (ctx.ugcOnly) notFound(); // D-UGCPORTAL: UGC não tem saque.
  const tab = await portalWithdrawalTab(db(), ctx);
  if (tab.blocks.length) redirect(`/portal/${ctx.brand.slug}/saque`);
  const [brand, account] = await Promise.all([
    db().brand.findUniqueOrThrow({ where: { id: ctx.brand.id }, select: { name: true, legalName: true, nfTakerDocument: true, timezone: true } }),
    db().creator.findUniqueOrThrow({ where: { id: ctx.creatorId }, select: { account: { select: { pixKey: true } } } }),
  ]);
  const pixKeyMasked = account.account.pixKey ? mask(account.account.pixKey) : null;
  // D-PFRECEIPT: pessoa física saca com recibo, sem nota.
  if (tab.individual)
    return (
      <ReceiptForm
        marca={ctx.brand.slug}
        requestId={randomUUID()}
        availableCents={tab.balance.availableCents}
        pixKeyMasked={pixKeyMasked}
        receipt={{
          payerName: brand.legalName ?? brand.name,
          payerDocument: brand.nfTakerDocument,
          brandName: brand.name,
          releasedThrough: tab.release.releasedThrough,
          day: dayKey(new Date(), brand.timezone),
        }}
      />
    );
  return (
    <WithdrawalForm
      marca={ctx.brand.slug}
      requestId={randomUUID()}
      availableCents={tab.balance.availableCents}
      takerDocument={brand.nfTakerDocument}
      pixKeyMasked={pixKeyMasked}
    />
  );
}
